import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DocumentStore, FileError, createApp, startServer } from '../packages/server/src/index.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const fixture = join(root, 'fixtures/docs')
const output = join(root, '.test-output')

test('directory API is shallow, directories first, with expected document types', async () => {
  const { app } = await createApp({ root: fixture })
  const response = await app.request('http://localhost/api/entries?path=')
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.path, '')
  const kinds = body.entries.map((entry: { kind: string }) => entry.kind)
  assert.equal(kinds[0], 'directory')
  assert.equal(body.entries.some((entry: { path: string }) => entry.path.includes('/')), false)
  assert.equal(body.entries.find((entry: { name: string }) => entry.name === 'README.md').kind, 'markdown')
  const config = await (await app.request('http://localhost/api/config')).json()
  assert.equal(config.rootName, 'docs')
  assert.equal('root' in config, false)
})

test('Unicode, encoded names, cross-directory links, assets and native-link redirects', async () => {
  const { app } = await createApp({ root: fixture })
  const query = new URLSearchParams({ from: 'README.md', href: './指南/100%25%20完成%23记录.md' })
  const resolved = await (await app.request(`http://localhost/api/resolve?${query}`)).json()
  assert.deepEqual(resolved, { kind: 'document', path: '指南/100% 完成#记录.md', hash: '' })
  const doc = await app.request(`http://localhost/api/document?${new URLSearchParams({ path: resolved.path })}`)
  assert.equal(doc.status, 200)
  assert.match((await doc.json()).content, /只解码一次/)
  const directory = await (await app.request(`http://localhost/api/resolve?${new URLSearchParams({ from: 'README.md', href: './项目示例/' })}`)).json()
  assert.equal(directory.kind, 'directory')
  const redirect = await app.request(`http://localhost/api/open?${new URLSearchParams({ from: '指南/快速开始.md', href: '../项目示例/README.md#项目结构' })}`)
  assert.equal(redirect.status, 303)
  assert.equal(redirect.headers.get('Location'), `/document?path=${encodeURIComponent('项目示例/README.md')}#${encodeURIComponent('项目结构')}`)
  const svg = await app.request('http://localhost/api/assets?path=images%2Freading.svg')
  assert.equal(svg.status, 200)
  assert.equal(svg.headers.get('content-type'), 'image/svg+xml')
  assert.match(svg.headers.get('content-security-policy')!, /sandbox/)
  assert.match(await svg.text(), /<svg/)
  const download = await app.request('http://localhost/api/assets?path=README.md')
  assert.match(download.headers.get('content-disposition')!, /^attachment;/)
})

test('API errors remain JSON and distinguish invalid paths, missing files and unsupported types', async () => {
  const { app } = await createApp({ root: fixture })
  for (const [endpoint, status] of [
    ['entries?path=..%2Fsecret', 403],
    ['entries?path=.git', 403],
    ['document?path=absent.md', 404],
    ['document?path=images%2Freading.svg', 415],
    ['resolve?from=README.md&href=javascript%3Aalert(1)', 400],
    ['missing', 404],
  ] as const) {
    const response = await app.request(`http://localhost/api/${endpoint}`)
    assert.equal(response.status, status, endpoint)
    assert.ok((await response.json()).error.message)
  }
  assert.equal((await app.request('http://attacker.example/api/config')).status, 403)
  assert.equal((await app.request('http://localhost/api/config', { headers: { Origin: 'https://attacker.example' } })).status, 403)
  assert.equal((await app.request('http://localhost/api/document?path=README.md', { method: 'POST' })).status, 404)
})

test('realpath contains Windows junctions, excludes hidden internals, and enforces document limits', async t => {
  await mkdir(output, { recursive: true })
  const temp = await mkdtemp(join(output, 'boundaries-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const docs = join(temp, 'docs')
  const outside = join(temp, 'docs-neighbor')
  await mkdir(docs)
  await mkdir(outside)
  await mkdir(join(docs, '.git'))
  await writeFile(join(outside, 'secret.md'), 'outside root')
  await writeFile(join(docs, 'large.md'), 'x'.repeat(10 * 1024 * 1024 + 1))
  await symlink(outside, join(docs, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  const store = await DocumentStore.create(docs)
  await assert.rejects(store.locate('escape/secret.md'), (error: unknown) => error instanceof FileError && error.status === 403)
  assert.equal((await store.list('')).entries.some(entry => ['escape', '.git'].includes(entry.name)), false)
  await assert.rejects(store.document('large.md'), (error: unknown) => error instanceof FileError && error.status === 413)
})

test('production SPA deep links load while missing resources return actual 404s', async t => {
  await mkdir(output, { recursive: true })
  const temp = await mkdtemp(join(output, 'frontend-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  await writeFile(join(temp, 'index.html'), '<div id="app">Reader</div>')
  const { app } = await createApp({ root: fixture, frontendDir: temp })
  assert.match(await (await app.request('http://localhost/document?path=README.md')).text(), /Reader/)
  assert.equal((await app.request('http://localhost/assets/missing.js')).status, 404)
  assert.equal((await app.request('http://localhost/api/missing')).headers.get('content-type'), 'application/json')
})

test('real listening server handles strict port conflicts, fallback and close', async t => {
  const first = await startServer({ root: fixture, port: 0 })
  t.after(first.close)
  const config = await (await fetch(`${first.url}/api/config`)).json()
  assert.equal(config.name, 'mdnook')
  await assert.rejects(startServer({ root: fixture, port: first.port, strictPort: true }), /已被占用/)
  const fallback = await startServer({ root: fixture, port: first.port })
  assert.ok(fallback.port > first.port)
  const port = fallback.port
  await fallback.close()
  const reopened = await startServer({ root: fixture, port, strictPort: true })
  await reopened.close()
})
