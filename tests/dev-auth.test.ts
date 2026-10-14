import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { request as httpsRequest } from 'node:https'
import { join } from 'node:path'
import { createServer } from '../apps/web/node_modules/vite/dist/node/index.js'
import { documentApi } from '../apps/web/dev/api.js'
import { parseDevOptions, devEnvironment } from '../scripts/dev-options.mjs'

const root = join(import.meta.dirname, '..')
const webRoot = join(root, 'apps/web')
const fixture = join(root, 'fixtures/docs')
const external = Object.values(networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal)?.address

test('development options default to authenticated LAN serving and require an explicit opt out', () => {
  const options = parseDevOptions([], root, fixture)
  assert.equal(options.authentication, 'system')
  assert.equal(options.host, '0.0.0.0')
  assert.equal(options.root, fixture)
  const disabled = parseDevOptions(['./fixtures/docs', '--no-auth', '--port', '5300', '--api-port', '8900'], root, fixture)
  assert.equal(disabled.authentication, 'disabled')
  assert.equal(devEnvironment(disabled, {}).MDNOOK_DEV_AUTH, 'disabled')
  assert.equal(disabled.port, 5300)
  assert.equal(disabled.apiPort, 8900)
  assert.equal(parseDevOptions(['--tls-cert', './cert.pem', '--tls-key', './key.pem'], root, fixture).tlsCert, join(root, 'cert.pem'))
  for (const args of [['--no-auht'], ['--port', '0'], ['--api-port', '65536'], ['--tls-cert', 'cert.pem'], ['--host', 'attacker.example'], ['a', 'b']]) assert.throws(() => parseDevOptions(args, root, fixture))
})

async function configuredDev(authentication: 'system' | 'disabled') {
  const environment = devEnvironment({ root: fixture, host: '0.0.0.0', port: 5173, apiPort: 8787, authentication, tlsCert: '', tlsKey: '' }, {})
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]))
  Object.assign(process.env, environment)
  try {
    const vite = await createServer({
      configFile: join(webRoot, 'vite.config.ts'), root: webRoot, logLevel: 'silent',
      server: { port: 0, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
    })
    await vite.listen()
    const address = vite.httpServer!.address()
    if (!address || typeof address === 'string') throw new Error('missing Vite address')
    return { vite, port: address.port }
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
}

test('actual Vite configuration keeps loopback exempt, blocks LAN APIs and prevents filesystem bypass', async t => {
  const { vite, port } = await configuredDev('system')
  t.after(() => vite.close())
  assert.equal(vite.config.server.host, '0.0.0.0')
  assert.equal(vite.config.server.proxy, undefined)
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/document?path=README.md`)).status, 200)
  if (!external) return t.diagnostic('No non-loopback IPv4 interface; LAN assertions skipped')
  const url = `http://${external}:${port}`
  const session = await (await fetch(`${url}/api/auth/session`)).json()
  assert.deepEqual(session, { authenticated: false, mode: 'system', username: null, loginAvailable: false })
  for (const path of ['/api/config', '/api/entries', '/api/document?path=README.md', '/api/assets?path=README.md&download=1']) {
    const response = await fetch(`${url}${path}`, { headers: { 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '::1', 'X-Forwarded-Proto': 'https' } })
    assert.equal(response.status, 401, path)
  }
  const rawFile = `${url}/@fs/${join(fixture, 'README.md').replaceAll('\\', '/')}?raw`
  assert.equal((await fetch(rawFile)).status, 403)
  const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test-owner', password: 'test-password' }) })
  assert.equal(login.status, 403)
  assert.equal((await login.json()).error.code, 'HTTPS_REQUIRED')
})

test('Vite opt out is explicit, visible in session metadata, and still enforces the document root', async t => {
  const { vite, port } = await configuredDev('disabled')
  t.after(() => vite.close())
  const url = `http://${external ?? '127.0.0.1'}:${port}`
  assert.equal((await (await fetch(`${url}/api/auth/session`)).json()).mode, 'disabled')
  assert.equal((await fetch(`${url}/api/document?path=README.md`)).status, 200)
  assert.equal((await fetch(`${url}/api/document?path=..%2Fsecret.md`)).status, 403)
})

test('Vite HTTPS preserves the original TLS peer, authenticates, persists the cookie and revokes on logout', async t => {
  const https = { cert: await readFile(join(import.meta.dirname, 'fixtures/tls/cert.pem')), key: await readFile(join(import.meta.dirname, 'fixtures/tls/key.pem')) }
  let verifications = 0
  const vite = await createServer({
    configFile: false, root: webRoot, logLevel: 'silent',
    plugins: [documentApi({ root: fixture, authenticator: { authenticate: async (user, password) => { verifications++; return user === 'owner' && password === 'valid' ? 'owner' : null } } })],
    server: { host: '0.0.0.0', port: 0, https, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
  })
  t.after(() => vite.close())
  await vite.listen()
  const address = vite.httpServer!.address()
  if (!address || typeof address === 'string') throw new Error('missing Vite address')
  const host = external ?? '127.0.0.1'
  const url = `https://${host}:${address.port}`
  const request = (path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => new Promise<{ status: number; body: string; cookie?: string }>((resolve, reject) => {
    const req = httpsRequest(`${url}${path}`, { rejectUnauthorized: false, method: init.method, headers: init.headers }, response => {
      let body = ''
      response.setEncoding('utf8').on('data', chunk => { body += chunk })
      response.once('end', () => resolve({ status: response.statusCode!, body, cookie: response.headers['set-cookie']?.[0]?.split(';')[0] }))
    }).on('error', reject)
    req.end(init.body)
  })
  if (!external) return t.diagnostic('No non-loopback IPv4 interface; remote TLS assertions skipped')
  assert.equal((await request('/api/config')).status, 401)
  const login = await request('/api/auth/login', { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'owner', password: 'valid' }) })
  assert.equal(login.status, 200)
  assert.equal(verifications, 1)
  assert.ok(login.cookie)
  assert.equal((await request('/api/document?path=README.md', { headers: { Cookie: login.cookie } })).status, 200)
  assert.equal((await request('/api/auth/logout', { method: 'POST', headers: { Origin: url, Cookie: login.cookie } })).status, 200)
  assert.equal((await request('/api/config', { headers: { Cookie: login.cookie } })).status, 401)
})
