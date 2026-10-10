import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import type { Server } from 'node:http'
import { extname, isAbsolute, join, relative, sep } from 'node:path'
import { Readable } from 'node:stream'
import { createAdaptorServer } from '@hono/node-server'
import { Hono } from 'hono'
import { DocumentStore, FileError, translateError } from './store.js'

export { DocumentStore, FileError } from './store.js'

export interface ServerOptions {
  root: string
  frontendDir?: string
  version?: string
}

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
}
const inlineImages = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico'])

export async function createApp(options: ServerOptions) {
  const store = await DocumentStore.create(options.root)
  const app = new Hono()

  app.use('*', async (c, next) => {
    const url = new URL(c.req.url)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      return c.json({ error: { code: 'INVALID_HOST', message: '仅支持本机访问' } }, 403)
    }
    const origin = c.req.header('Origin')
    if (origin && origin !== url.origin) {
      return c.json({ error: { code: 'INVALID_ORIGIN', message: '请求来源不匹配' } }, 403)
    }
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('Cache-Control', 'no-store')
    await next()
  })

  app.onError((error, c) => {
    const failure = translateError(error)
    return c.json({ error: { code: failure.code, message: failure.message } }, failure.status)
  })

  app.get('/api/config', c => c.json({ name: 'mdnook', version: options.version ?? '0.0.2', rootName: store.rootName }))
  app.get('/api/entries', async c => c.json(await store.list(c.req.query('path') ?? '')))
  app.get('/api/document', async c => c.json(await store.document(c.req.query('path') ?? '')))
  app.get('/api/resolve', async c => c.json(await store.resolve(c.req.query('from') ?? '', c.req.query('href') ?? '')))
  app.get('/api/open', async c => {
    const target = await store.resolve(c.req.query('from') ?? '', c.req.query('href') ?? '')
    if (target.kind === 'external') return c.redirect(target.href, 303)
    const hash = target.hash ? `#${encodeURIComponent(target.hash)}` : ''
    const query = `path=${encodeURIComponent(target.path)}`
    return c.redirect(target.kind === 'asset' ? `/api/assets?${query}` : `/${target.kind === 'directory' ? 'browse' : 'document'}?${query}${hash}`, 303)
  })
  app.get('/api/assets', async c => {
    const file = await store.locate(c.req.query('path') ?? '')
    const info = await stat(file.absolute)
    if (!info.isFile()) throw new FileError('NOT_FILE', '目标不是文件', 415)
    const extension = extname(file.path).toLowerCase()
    c.header('Content-Type', mimeTypes[extension] ?? 'application/octet-stream')
    c.header('Content-Length', String(info.size))
    if (!inlineImages.has(extension)) {
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
      if (['/', '/browse', '/document'].includes(path)) path = '/index.html'
      const absolute = join(frontend, path)
      const rel = relative(frontend, absolute)
      if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new FileError('INVALID_PATH', '无效的页面路径', 403)
      try {
        const resolved = await realpath(absolute)
        const resolvedRel = relative(frontend, resolved)
        if (resolvedRel.startsWith(`..${sep}`) || resolvedRel === '..' || isAbsolute(resolvedRel)) throw new FileError('INVALID_PATH', '无效的页面路径', 403)
        if (!(await stat(resolved)).isFile()) throw new FileError('NOT_FOUND', '页面不存在', 404)
        c.header('Content-Type', mimeTypes[extname(resolved)] ?? 'application/octet-stream')
        c.header('Content-Security-Policy', "default-src 'self'; img-src 'self' https: http:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        return c.body(await readFile(resolved))
      } catch (error) { throw translateError(error) }
    })
  }
  return { app, store }
}

export async function startServer(options: ServerOptions & { port?: number; strictPort?: boolean }) {
  const { app, store } = await createApp(options)
  const firstPort = options.port ?? 8787
  const attempts = options.strictPort || firstPort === 0 ? 1 : 21
  for (let offset = 0; offset < attempts; offset++) {
    const port = firstPort + offset
    if (port > 65535) break
    const server = createAdaptorServer({ fetch: app.fetch }) as Server
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error)
        server.once('error', onError)
        server.listen(port, '127.0.0.1', () => { server.off('error', onError); resolve() })
      })
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('无法获取服务地址')
      const close = () => new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
        server.closeAllConnections()
      })
      return { server, store, port: address.port, url: `http://127.0.0.1:${address.port}`, close }
    } catch (error) {
      server.close()
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      if (options.strictPort) throw new Error(`端口 ${port} 已被占用，请使用 --port 指定其他端口`)
    }
  }
  throw new Error('没有可用端口，请使用 --port 指定端口')
}
