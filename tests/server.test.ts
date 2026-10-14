import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DocumentStore, FileError, createApp as createServerApp, startServer } from '../packages/server/src/index.js'
import type { ServerOptions } from '../packages/server/src/index.js'

// Direct Hono requests have no TCP socket; these existing filesystem cases model local access.
async function createApp(options: ServerOptions) {
  const result = await createServerApp(options)
  return { ...result, app: { request: (url: string, init?: RequestInit) => result.app.request(url, init, { incoming: { socket: { remoteAddress: '127.0.0.1' } } }) } }
}

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
  assert.match(config.rootId, /^[a-f0-9]{24}$/)
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
  const imageReference = await (await app.request(`http://localhost/api/resolve?${new URLSearchParams({ from: '指南/链接与图片.md', href: '../images/reading.svg' })}`)).json()
  assert.deepEqual(imageReference, { kind: 'image', path: 'images/reading.svg', hash: '' })
  const imageRedirect = await app.request(`http://localhost/api/open?${new URLSearchParams({ from: '指南/链接与图片.md', href: '../images/reading.svg' })}`)
  assert.equal(imageRedirect.headers.get('Location'), '/file?path=images%2Freading.svg')
  const imageDownload = await app.request('http://localhost/api/assets?path=images%2Freading.svg&download=1')
  assert.match(imageDownload.headers.get('content-disposition')!, /^attachment;/)
  assert.match(imageDownload.headers.get('content-security-policy')!, /sandbox/)
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
    ['file?path=absent.png', 404],
    ['file?path=images', 415],
    ['file?path=..%2Fsecret', 403],
    ['file?path=.git', 403],
    ['text?path=images', 415],
    ['text?path=absent.json', 404],
    ['text?path=..%2Fsecret.txt', 403],
    ['text?path=.git%2Fconfig.txt', 403],
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
  await assert.rejects(store.file('escape/secret.md'), (error: unknown) => error instanceof FileError && error.status === 403)
  assert.equal((await store.list('')).entries.some(entry => ['escape', '.git'].includes(entry.name)), false)
  await assert.rejects(store.document('large.md'), (error: unknown) => error instanceof FileError && error.status === 413)
})

test('text API supports UTF-8 sources while rejecting binary, invalid encoding, oversized and escaped files', async t => {
  await mkdir(output, { recursive: true })
  const temp = await mkdtemp(join(output, 'text-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const firstRoot = join(temp, 'first', 'docs')
  const secondRoot = join(temp, 'second', 'docs')
  await mkdir(firstRoot, { recursive: true })
  await mkdir(secondRoot, { recursive: true })
  await writeFile(join(firstRoot, '资料 #100%.JSON'), '\ufeff{"title":"中文"}')
  await writeFile(join(firstRoot, 'source.SVG'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  await writeFile(join(firstRoot, 'bad.txt'), Buffer.from([0xc3, 0x28]))
  await writeFile(join(firstRoot, 'binary.txt'), Buffer.from([0x41, 0, 0x42]))
  await writeFile(join(firstRoot, 'file.bin'), 'not an allowed text extension')
  await writeFile(join(firstRoot, 'large.json'), 'x'.repeat(10 * 1024 * 1024 + 1))
  await symlink(secondRoot, join(firstRoot, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  await writeFile(join(secondRoot, 'secret.txt'), 'outside root')
  const { app } = await createApp({ root: firstRoot })
  const response = await app.request(`http://localhost/api/text?${new URLSearchParams({ path: '资料 #100%.JSON' })}`)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).content, '{"title":"中文"}')
  const svg = await app.request('http://localhost/api/text?path=source.SVG')
  assert.equal(svg.status, 200)
  assert.match((await svg.json()).content, /^<svg/)
  for (const [path, status, code] of [
    ['bad.txt', 415, 'INVALID_TEXT'], ['binary.txt', 415, 'INVALID_TEXT'],
    ['file.bin', 415, 'NOT_TEXT'], ['large.json', 413, 'TEXT_TOO_LARGE'],
    ['escape/secret.txt', 403, 'OUTSIDE_ROOT'],
  ] as const) {
    const rejected = await app.request(`http://localhost/api/text?${new URLSearchParams({ path })}`)
    assert.equal(rejected.status, status)
    assert.equal((await rejected.json()).error.code, code)
  }
  const config = await (await app.request('http://localhost/api/config')).json()
  const repeated = await createApp({ root: firstRoot })
  assert.equal((await (await repeated.app.request('http://localhost/api/config')).json()).rootId, config.rootId)
  const other = await createApp({ root: secondRoot })
  assert.notEqual((await (await other.app.request('http://localhost/api/config')).json()).rootId, config.rootId)
})

test('production SPA deep links load while missing resources return actual 404s', async t => {
  await mkdir(output, { recursive: true })
  const temp = await mkdtemp(join(output, 'frontend-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  await writeFile(join(temp, 'index.html'), '<div id="app">Reader</div>')
  const { app } = await createApp({ root: fixture, frontendDir: temp })
  assert.match(await (await app.request('http://localhost/document?path=README.md')).text(), /Reader/)
  assert.match(await (await app.request('http://localhost/file?path=images%2Freading.svg')).text(), /Reader/)
  assert.equal((await app.request('http://localhost/assets/missing.js')).status, 404)
  assert.equal((await app.request('http://localhost/api/missing')).headers.get('content-type'), 'application/json')
})

test('encoded uppercase image names preview inline while unsupported images keep a download fallback', async t => {
  await mkdir(output, { recursive: true })
  const temp = await mkdtemp(join(output, 'images-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const name = '图片 #100%.PNG'
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  await writeFile(join(temp, name), png)
  await writeFile(join(temp, 'unsupported.TIFF'), 'placeholder for unsupported image routing')
  const { app } = await createApp({ root: temp })
  const query = new URLSearchParams({ path: name })
  const metadataResponse = await app.request(`http://localhost/api/file?${query}`)
  assert.equal(metadataResponse.status, 200)
  const metadata = await metadataResponse.json()
  assert.deepEqual(metadata, {
    path: name, name, extension: '.png', mediaType: 'image/png', size: png.length,
    modifiedAt: metadata.modifiedAt,
    assetUrl: `/api/assets?path=${encodeURIComponent(name)}`,
    downloadUrl: `/api/assets?path=${encodeURIComponent(name)}&download=1`,
  })
  assert.ok(Number.isFinite(Date.parse(metadata.modifiedAt)))
  const metadataAsset = await app.request(`http://localhost${metadata.assetUrl}`)
  assert.deepEqual(Buffer.from(await metadataAsset.arrayBuffer()), png)
  const inline = await app.request(`http://localhost/api/assets?${query}`)
  assert.equal(inline.headers.get('content-type'), 'image/png')
  assert.equal(inline.headers.get('content-disposition'), null)
  assert.deepEqual(Buffer.from(await inline.arrayBuffer()), png)
  const download = await app.request(`http://localhost/api/assets?${query}&download=1`)
  assert.match(download.headers.get('content-disposition')!, new RegExp(`filename\\*=UTF-8''${encodeURIComponent(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
  const imageQuery = new URLSearchParams({ from: 'README.md', href: `./${encodeURIComponent(name)}` })
  assert.equal((await (await app.request(`http://localhost/api/resolve?${imageQuery}`)).json()).kind, 'image')
  const redirect = await app.request(`http://localhost/api/open?${imageQuery}`)
  assert.equal(redirect.headers.get('Location'), `/file?path=${encodeURIComponent(name)}`)
  const unsupportedQuery = new URLSearchParams({ from: 'README.md', href: './unsupported.TIFF' })
  assert.equal((await (await app.request(`http://localhost/api/resolve?${unsupportedQuery}`)).json()).kind, 'image')
  const unsupportedAsset = await app.request('http://localhost/api/assets?path=unsupported.TIFF')
  assert.equal(unsupportedAsset.headers.get('content-type'), 'application/octet-stream')
  assert.match(unsupportedAsset.headers.get('content-disposition')!, /^attachment;/)
  const denied = await app.request('http://localhost/api/assets?path=..%2Foutside.png&download=1')
  assert.equal(denied.status, 403)
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
