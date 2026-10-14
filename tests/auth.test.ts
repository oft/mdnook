import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { request as httpsRequest } from 'node:https'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { createApp, startServer } from '../packages/server/src/index.js'
import { isLoopbackAddress } from '../packages/server/src/auth.js'
import { AuthenticationUnavailable, createSystemAuthenticator } from '../packages/server/src/system-auth.js'

const fixture = join(import.meta.dirname, '../fixtures/docs')
const origin = 'https://192.0.2.10'
const remote = { incoming: { socket: { remoteAddress: '192.0.2.20', encrypted: true } } }
const good = { authenticate: async (username: string, password: string) => username === 'owner' && password === 'valid' ? 'owner' : null }
async function setup(authenticator = good) {
  const { app } = await createApp({ root: fixture, host: '0.0.0.0', authenticator })
  const request = (path: string, init?: RequestInit, bindings = remote) => app.request(`${origin}${path}`, init, bindings)
  const login = (username = 'owner', password = 'valid', cookie = '') => request('/api/auth/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ username, password }),
  })
  return { app, request, login }
}
const cookieFrom = (response: Response) => response.headers.get('Set-Cookie')!.split(';')[0]!

test('loopback detection handles IPv4, IPv6 and mapped IPv6 without trusting names', () => {
  for (const address of ['127.0.0.1', '127.12.34.56', '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:1']) assert.equal(isLoopbackAddress(address), true, address)
  for (const address of [undefined, 'localhost', '127.0.0.1.attacker', '127.999.0.1', '128.0.0.1', '::ffff:192.168.1.1', '192.168.1.1']) assert.equal(isLoopbackAddress(address), false, address)
})

test('actual loopback peers bypass authentication; remote and missing peers cannot spoof it', async () => {
  const { app } = await setup({ authenticate: async () => { throw new Error('must not authenticate local API calls') } })
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    const response = await app.request('http://localhost/api/config', {}, { incoming: { socket: { remoteAddress: address } } })
    assert.equal(response.status, 200)
  }
  for (const bindings of [{}, remote]) {
    const response = await app.request('http://127.0.0.1/api/config', { headers: { 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '::1', Forwarded: 'for=127.0.0.1' } }, bindings)
    assert.equal(response.status, 401)
  }
  const session = await (await app.request('http://localhost/api/auth/session', {}, { incoming: { socket: { remoteAddress: '::1' } } })).json()
  assert.deepEqual(session, { authenticated: true, mode: 'loopback', username: null, loginAvailable: true })
})

test('all document APIs, metadata, assets, downloads and native redirects require a remote session', async () => {
  const { request } = await setup()
  for (const path of ['/api/config', '/api/entries', '/api/file?path=README.md', '/api/document?path=README.md', '/api/text?path=README.md', '/api/resolve?from=README.md&href=README.md', '/api/open?from=README.md&href=README.md', '/api/assets?path=README.md', '/api/assets?path=images/reading.svg&download=1']) {
    const response = await request(path)
    assert.equal(response.status, 401, path)
    assert.equal((await response.json()).error.code, 'AUTH_REQUIRED')
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
  }
})

test('remote sessions authenticate with the OS provider, rotate, and revoke on logout', async () => {
  let calls = 0
  const { request, login } = await setup({ authenticate: async (username, password) => { calls++; return good.authenticate(username, password) } })
  assert.equal((await login('other', 'valid')).status, 401)
  assert.equal((await login('owner', 'wrong')).status, 401)
  const response = await login()
  assert.equal(response.status, 200)
  const cookie = cookieFrom(response)
  assert.match(response.headers.get('Set-Cookie')!, /HttpOnly/)
  assert.match(response.headers.get('Set-Cookie')!, /Secure/)
  assert.match(response.headers.get('Set-Cookie')!, /SameSite=Strict/)
  assert.match(response.headers.get('Set-Cookie')!, /Max-Age=1800/)
  assert.equal(cookie.includes('owner'), false)
  assert.equal((await request('/api/config', { headers: { Cookie: cookie } })).status, 200)
  assert.equal((await request('/api/assets?path=README.md', { headers: { Cookie: cookie } })).status, 200)
  const rotated = await login('owner', 'valid', cookie)
  const newCookie = cookieFrom(rotated)
  assert.notEqual(newCookie, cookie)
  assert.equal((await request('/api/config', { headers: { Cookie: cookie } })).status, 401)
  assert.equal((await request('/api/config', { headers: { Cookie: newCookie } })).status, 200)
  const logout = await request('/api/auth/logout', { method: 'POST', headers: { Origin: origin, Cookie: newCookie } })
  assert.equal(logout.status, 200)
  assert.equal((await request('/api/config', { headers: { Cookie: newCookie } })).status, 401)
  assert.equal(calls, 4)
})

test('remote HTTP cannot authenticate or reuse a secure session, even with forwarded protocol headers', async () => {
  const { app, login } = await setup()
  const cookie = cookieFrom(await login())
  const insecure = { incoming: { socket: { remoteAddress: '192.0.2.20' } } }
  const response = await app.request('http://192.0.2.10/api/auth/login', {
    method: 'POST', headers: { Origin: 'http://192.0.2.10', 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' }, body: JSON.stringify({ username: 'owner', password: 'valid' }),
  }, insecure)
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error.code, 'HTTPS_REQUIRED')
  assert.equal((await app.request('http://192.0.2.10/api/config', { headers: { Cookie: cookie } }, insecure)).status, 401)
  const session = await (await app.request('http://192.0.2.10/api/auth/session', {}, insecure)).json()
  assert.equal(session.loginAvailable, false)
})

test('cross-origin, cross-site and missing-origin login/logout requests are rejected', async () => {
  const { request, login } = await setup()
  const cookie = cookieFrom(await login())
  for (const path of ['/api/auth/login', '/api/auth/logout']) {
    for (const headers of [{}, { Origin: 'https://attacker.example' }, { Origin: origin, 'Sec-Fetch-Site': 'cross-site' }]) {
      assert.equal((await request(path, { method: 'POST', headers: { Cookie: cookie, ...headers } })).status, 403)
    }
  }
  assert.equal((await request('/api/config', { headers: { Cookie: cookie, Origin: 'null' } })).status, 403)
  assert.equal((await request('/api/config', { headers: { Cookie: cookie } })).status, 200)
})

test('expired, forged and restarted-server sessions fail closed', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  const { request, login } = await setup()
  const cookie = cookieFrom(await login())
  const other = await setup()
  assert.equal((await other.request('/api/config', { headers: { Cookie: cookie } })).status, 401)
  assert.equal((await request('/api/config', { headers: { Cookie: `${cookie}tampered` } })).status, 401)
  t.mock.timers.tick(30 * 60 * 1000 + 1)
  assert.equal((await request('/api/config', { headers: { Cookie: cookie } })).status, 401)
  assert.equal((await (await request('/api/auth/session', { headers: { Cookie: cookie } })).json()).authenticated, false)
})

test('login payload validation, size limits and throttling happen before OS authentication', async () => {
  let calls = 0
  const { request, login } = await setup({ authenticate: async () => { calls++; return null } })
  const post = (body: string) => request('/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body })
  assert.equal((await post('x'.repeat(8193))).status, 413)
  assert.equal((await post('{broken')).status, 400)
  assert.equal((await login('', 'valid')).status, 400)
  assert.equal((await login('owner', '')).status, 400)
  assert.equal((await login('owner', 'valid\0tail')).status, 400)
  assert.equal((await login()).status, 401)
  const throttled = await login()
  assert.equal(throttled.status, 429)
  assert.equal(throttled.headers.get('Retry-After'), '60')
  assert.equal(calls, 1)
})

test('unavailable native authentication never grants a session', async () => {
  const { request, login } = await setup({ authenticate: async () => { throw new AuthenticationUnavailable() } })
  const response = await login()
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'AUTH_UNAVAILABLE')
  assert.equal(response.headers.get('Set-Cookie'), null)
  assert.equal((await request('/api/config')).status, 401)
})

test('concurrent login submissions never start two native verifications', async () => {
  let complete!: (username: string | null) => void
  let entered!: () => void
  let calls = 0
  const started = new Promise<void>(resolve => { entered = resolve })
  const { login } = await setup({ authenticate: async () => {
    calls++
    entered()
    return new Promise<string | null>(resolve => { complete = resolve })
  } })
  const first = login()
  await started
  assert.equal((await login()).status, 429)
  complete('owner')
  assert.equal((await first).status, 200)
  assert.equal(calls, 1)
})

test('non-loopback listeners require TLS before opening a port', async () => {
  await assert.rejects(startServer({ root: fixture, host: '0.0.0.0', port: 0 }), /非回环监听/)
  await assert.rejects(startServer({ root: fixture, host: '::', port: 0 }), /非回环监听/)
  await assert.rejects(startServer({ root: fixture, host: 'invalid', port: 0 }), /IPv4 或 IPv6/)
})

test('explicitly disabled authentication admits remote HTTP while retaining filesystem and origin checks', async t => {
  const runtime = await startServer({ root: fixture, host: '0.0.0.0', port: 0, authentication: 'disabled', authenticator: {
    check: async () => { throw new Error('disabled authentication must not probe the OS') },
    authenticate: async () => { throw new Error('disabled authentication must not verify passwords') },
  } })
  t.after(runtime.close)
  const external = Object.values(networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal)?.address ?? '127.0.0.1'
  const url = `http://${external}:${runtime.port}`
  assert.deepEqual(await (await fetch(`${url}/api/auth/session`)).json(), { authenticated: true, mode: 'disabled', username: null, loginAvailable: false })
  assert.equal((await fetch(`${url}/api/document?path=README.md`)).status, 200)
  assert.equal((await fetch(`${url}/api/document?path=..%2Fsecret.md`)).status, 403)
  assert.equal((await fetch(`${url}/api/config`, { headers: { Origin: 'https://attacker.example' } })).status, 403)
})

test('real TLS sockets distinguish loopback and non-loopback source addresses', async t => {
  const tls = { cert: await readFile(join(import.meta.dirname, 'fixtures/tls/cert.pem')), key: await readFile(join(import.meta.dirname, 'fixtures/tls/key.pem')) }
  const runtime = await startServer({ root: fixture, host: '0.0.0.0', tls, port: 0, authenticator: good })
  t.after(runtime.close)
  const fetchTls = (host: string, path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => new Promise<{ status: number; body: string; cookie?: string }>((resolve, reject) => {
    const request = httpsRequest(`https://${host}:${runtime.port}${path}`, { rejectUnauthorized: false, method: init.method, headers: init.headers }, response => {
      let body = ''
      response.setEncoding('utf8').on('data', chunk => { body += chunk })
      response.on('end', () => resolve({ status: response.statusCode!, body, cookie: response.headers['set-cookie']?.[0]?.split(';')[0] }))
    }).on('error', reject)
    request.end(init.body)
  })
  assert.equal((await fetchTls('127.0.0.1', '/api/config')).status, 200)
  const external = Object.values(networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal)?.address
  if (external) {
    assert.equal((await fetchTls(external, '/api/config')).status, 401)
    const response = await fetchTls(external, '/api/auth/session')
    assert.equal(JSON.parse(response.body).mode, 'system')
    const tlsOrigin = `https://${external}:${runtime.port}`
    const login = await fetchTls(external, '/api/auth/login', { method: 'POST', headers: { Origin: tlsOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'owner', password: 'valid' }) })
    assert.equal(login.status, 200)
    assert.ok(login.cookie)
    assert.equal((await fetchTls(external, '/api/config', { headers: { Cookie: login.cookie } })).status, 200)
    assert.equal((await fetchTls(external, '/api/auth/logout', { method: 'POST', headers: { Cookie: login.cookie, Origin: tlsOrigin } })).status, 200)
    assert.equal((await fetchTls(external, '/api/config', { headers: { Cookie: login.cookie } })).status, 401)
  } else t.diagnostic('No non-loopback IPv4 interface; remote transport branch covered by request tests only')
})

test('Windows native helper loads and rejects an unrelated local identity', { skip: process.platform !== 'win32' }, async () => {
  const authenticator = createSystemAuthenticator()
  await authenticator.check!()
  assert.equal(await authenticator.authenticate('mdnook_nonexistent_test_identity', 'test-input'), null)
})
