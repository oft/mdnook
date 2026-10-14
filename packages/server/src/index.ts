import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import type { Server } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { isIP } from 'node:net'
import { isAbsolute, join, relative, sep } from 'node:path'
import { Readable } from 'node:stream'
import { createAdaptorServer, getRequestListener } from '@hono/node-server'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { fileMediaType, isInlineImage } from '@mdnook/shared'
import { DocumentStore, FileError, translateError } from './store.js'
import { connection, createAuthentication, isLoopbackAddress } from './auth.js'
import type { ServerEnvironment } from './auth.js'
import { AuthenticationUnavailable, createSystemAuthenticator } from './system-auth.js'
import type { SystemAuthenticator } from './system-auth.js'

export { DocumentStore, FileError } from './store.js'

export interface ServerOptions {
  root: string
  frontendDir?: string
  version?: string
  host?: string
  tls?: { cert: string | Buffer; key: string | Buffer }
  authenticator?: SystemAuthenticator
  authentication?: 'system' | 'disabled'
}

export async function createApp(options: ServerOptions) {
  const store = await DocumentStore.create(options.root)
  const app = new Hono<ServerEnvironment>()
  const auth = createAuthentication(options.authenticator ?? createSystemAuthenticator(), options.authentication !== 'disabled')
  const host = options.host ?? '127.0.0.1'

  app.use('*', async (c, next) => {
    const url = new URL(c.req.url)
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    const wildcard = host === '0.0.0.0' || host === '::'
    const allowedHost = hostname === 'localhost' || isLoopbackAddress(hostname)
      || hostname === host || (wildcard && isIP(hostname) !== 0)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('Cache-Control', 'no-store')
    if (!allowedHost) {
      return c.json({ error: { code: 'INVALID_HOST', message: '请求主机不匹配' } }, 403)
    }
    const origin = c.req.header('Origin')
    if ((origin && origin !== url.origin) || c.req.header('Sec-Fetch-Site') === 'cross-site') {
      return c.json({ error: { code: 'INVALID_ORIGIN', message: '请求来源不匹配' } }, 403)
    }
    await next()
  })

  app.onError((error, c) => {
    if (error instanceof AuthenticationUnavailable) return c.json({ error: { code: 'AUTH_UNAVAILABLE', message: error.message } }, 503)
    const failure = translateError(error)
    return c.json({ error: { code: failure.code, message: failure.message } }, failure.status)
  })

  app.use('/api/*', async (c, next) => {
    if (['/api/auth/session', '/api/auth/login', '/api/auth/logout'].includes(c.req.path)) {
      if (c.req.method === 'POST' && !connection(c).local && !c.req.header('Origin')) {
        return c.json({ error: { code: 'INVALID_ORIGIN', message: '登录请求缺少来源信息' } }, 403)
      }
      return next()
    }
    if (!auth.info(c).authenticated) return c.json({ error: { code: 'AUTH_REQUIRED', message: '请先使用系统账号登录' } }, 401)
    await next()
  })
  app.get('/api/auth/session', c => c.json(auth.info(c)))
  app.post('/api/auth/login', bodyLimit({ maxSize: 8192, onError: c => c.json({ error: { code: 'LOGIN_TOO_LARGE', message: '登录请求过大' } }, 413) }), auth.login)
  app.post('/api/auth/logout', auth.logout)

  const rootId = createHash('sha256').update(store.root).digest('hex').slice(0, 24)
  app.get('/api/config', c => c.json({ name: 'mdnook', version: options.version ?? '0.0.3', rootName: store.rootName, rootId }))
  app.get('/api/entries', async c => c.json(await store.list(c.req.query('path') ?? '')))
  app.get('/api/file', async c => c.json(await store.file(c.req.query('path') ?? '')))
  app.get('/api/document', async c => c.json(await store.document(c.req.query('path') ?? '')))
  app.get('/api/text', async c => c.json(await store.text(c.req.query('path') ?? '')))
  app.get('/api/resolve', async c => c.json(await store.resolve(c.req.query('from') ?? '', c.req.query('href') ?? '')))
  app.get('/api/open', async c => {
    const target = await store.resolve(c.req.query('from') ?? '', c.req.query('href') ?? '')
    if (target.kind === 'external') return c.redirect(target.href, 303)
    const hash = target.hash ? `#${encodeURIComponent(target.hash)}` : ''
    const query = `path=${encodeURIComponent(target.path)}`
    const page = target.kind === 'directory' ? 'browse' : target.kind === 'document' ? 'document' : 'file'
    return c.redirect(`/${page}?${query}${hash}`, 303)
  })
  app.get('/api/assets', async c => {
    const file = await store.locate(c.req.query('path') ?? '')
    const info = await stat(file.absolute)
    if (!info.isFile()) throw new FileError('NOT_FILE', '目标不是文件', 415)
    c.header('Content-Type', fileMediaType(file.path))
    c.header('Content-Length', String(info.size))
    if (!isInlineImage(file.path) || c.req.query('download') === '1') {
      c.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.path.split('/').at(-1) ?? 'file')}`)
    }
    // SVGs can render as images while remaining inert when navigated to directly.
    c.header('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'")
    const stream = Readable.toWeb(createReadStream(file.absolute)) as ReadableStream<Uint8Array>
    return new Response(stream, { headers: c.res.headers })
  })
  app.all('/api/*', c => c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404))

  if (options.frontendDir) {
    const frontend = await realpath(options.frontendDir)
    app.get('*', async c => {
      let path: string
      try { path = decodeURIComponent(new URL(c.req.url).pathname) } catch {
        throw new FileError('INVALID_PATH', '无效的页面路径')
      }
      if (path.includes('\\') || path.includes('\0')) throw new FileError('INVALID_PATH', '无效的页面路径')
      if (['/', '/browse', '/document', '/file'].includes(path)) path = '/index.html'
      const absolute = join(frontend, path)
      const rel = relative(frontend, absolute)
      if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new FileError('INVALID_PATH', '无效的页面路径', 403)
      try {
        const resolved = await realpath(absolute)
        const resolvedRel = relative(frontend, resolved)
        if (resolvedRel.startsWith(`..${sep}`) || resolvedRel === '..' || isAbsolute(resolvedRel)) throw new FileError('INVALID_PATH', '无效的页面路径', 403)
        if (!(await stat(resolved)).isFile()) throw new FileError('NOT_FOUND', '页面不存在', 404)
        c.header('Content-Type', fileMediaType(resolved))
        c.header('Content-Security-Policy', "default-src 'self'; img-src 'self' https: http:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        return c.body(await readFile(resolved))
      } catch (error) { throw translateError(error) }
    })
  }
  return { app, store }
}

/** Attach the API to an existing HTTP(S) listener without losing its peer socket. */
export async function createRequestHandler(options: ServerOptions) {
  const { app, store } = await createApp(options)
  return { handler: getRequestListener(app.fetch), store }
}

export async function startServer(options: ServerOptions & { port?: number; strictPort?: boolean }) {
  const host = options.host ?? '127.0.0.1'
  if (isIP(host) === 0) throw new Error('--host 必须是 IPv4 或 IPv6 地址')
  if (options.authentication !== 'disabled' && !isLoopbackAddress(host) && !options.tls) throw new Error('非回环监听需要同时配置 --tls-cert 和 --tls-key')
  if (options.authentication !== 'disabled' && !isLoopbackAddress(host)) await (options.authenticator ?? createSystemAuthenticator()).check?.()
  const { app, store } = await createApp(options)
  const firstPort = options.port ?? 8787
  const attempts = options.strictPort || firstPort === 0 ? 1 : 21
  for (let offset = 0; offset < attempts; offset++) {
    const port = firstPort + offset
    if (port > 65535) break
    const server = createAdaptorServer(options.tls
      ? { fetch: app.fetch, createServer: createHttpsServer, serverOptions: options.tls }
      : { fetch: app.fetch }) as Server
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error)
        server.once('error', onError)
        server.listen(port, host, () => { server.off('error', onError); resolve() })
      })
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('无法获取服务地址')
      const close = () => new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
        server.closeAllConnections()
      })
      const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '[::1]' : host.includes(':') ? `[${host}]` : host
      return { server, store, port: address.port, url: `${options.tls ? 'https' : 'http'}://${displayHost}:${address.port}`, close }
    } catch (error) {
      server.close()
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      if (options.strictPort) throw new Error(`端口 ${port} 已被占用，请使用 --port 指定其他端口`)
    }
  }
  throw new Error('没有可用端口，请使用 --port 指定端口')
}
