import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { validateReleaseTag } from '../scripts/check-release-tag.mjs'
import { publishedVersion, verifyPublishedVersion } from '../scripts/npm-registry.mjs'

const manifest = { name: 'mdnook', version: '0.0.1' }

test('release tags require a stable version matching the publishable CLI package', () => {
  validateReleaseTag('v0.0.1', manifest)
  for (const tag of [undefined, '0.0.1', 'v0.0', 'v01.0.1', 'v0.0.1-beta.1', 'v0.0.1+build', 'v0.0.2']) {
    assert.throws(() => validateReleaseTag(tag, manifest))
  }
  assert.throws(() => validateReleaseTag('v0.0.1', { ...manifest, private: true }))
  assert.throws(() => validateReleaseTag('v0.0.1', { ...manifest, name: 'mdnook-workspace' }))
})

test('registry verification distinguishes the same upload from an immutable version conflict', () => {
  const integrity = 'sha512-tested-tarball'
  const metadata = { ...manifest, dist: { integrity } }
  verifyPublishedVersion(metadata, manifest, integrity)
  assert.throws(() => verifyPublishedVersion(metadata, manifest, 'sha512-different-tarball'))
  assert.throws(() => verifyPublishedVersion({ ...metadata, version: '0.0.2' }, manifest, integrity))
  assert.throws(() => verifyPublishedVersion({ ...metadata, name: 'another-package' }, manifest, integrity))
  assert.throws(() => verifyPublishedVersion(manifest, manifest, integrity))
})

test('registry lookup treats only 404 as unpublished and rejects authorization/server failures', async t => {
  const server = createServer((request, response) => {
    if (request.url === '/mdnook/0.0.1') {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(manifest))
    } else {
      response.writeHead(request.url === '/mdnook/401' ? 401 : request.url === '/mdnook/500' ? 500 : 404)
      response.end()
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const registry = `http://127.0.0.1:${address.port}/`
  assert.deepEqual(await publishedVersion('mdnook', '0.0.1', registry), manifest)
  assert.equal(await publishedVersion('mdnook', 'absent', registry), null)
  await assert.rejects(publishedVersion('mdnook', '401', registry), /HTTP 401/)
  await assert.rejects(publishedVersion('mdnook', '500', registry), /HTTP 500/)
})
