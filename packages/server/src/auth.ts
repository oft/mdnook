import { randomBytes, createHash } from 'node:crypto'
import { BlockList, isIP } from 'node:net'
import type { Context } from 'hono'
import type { SessionInfo } from '@mdnook/shared'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { SystemAuthenticator } from './system-auth.js'

export interface ConnectionBindings {
  incoming?: { socket: { remoteAddress?: string; encrypted?: boolean } }
}
export type ServerEnvironment = { Bindings: ConnectionBindings }
type ServerContext = Context<ServerEnvironment>

const loopbacks = new BlockList()
loopbacks.addSubnet('127.0.0.0', 8, 'ipv4')
loopbacks.addAddress('::1', 'ipv6')
export function isLoopbackAddress(address: string | undefined): boolean {
  const family = address ? isIP(address) : 0
  return !!family && loopbacks.check(address!, family === 6 ? 'ipv6' : 'ipv4')
}

export function connection(c: ServerContext) {
  const socket = c.env?.incoming?.socket
  return { local: isLoopbackAddress(socket?.remoteAddress), address: socket?.remoteAddress ?? 'unknown', secure: socket?.encrypted === true }
}

const sessionLifetime = 30 * 60 * 1000
const cookieName = '__Host-mdnook-session'
const tokenKey = (token: string) => createHash('sha256').update(token).digest('hex')

export function createAuthentication(authenticator: SystemAuthenticator, enabled = true) {
  const sessions = new Map<string, { username: string; expires: number }>()
  const attempts = new Map<string, { count: number; expires: number }>()
  let globalAttempts = 0
  let windowEnds = 0
  let verifying = false
  function prune(now: number) {
    for (const [key, session] of sessions) if (session.expires <= now) sessions.delete(key)
    for (const [key, attempt] of attempts) if (attempt.expires <= now) attempts.delete(key)
  }
  function info(c: ServerContext): SessionInfo {
    const peer = connection(c)
    if (!enabled) return { authenticated: true, mode: 'disabled', username: null, loginAvailable: false }
    if (peer.local) return { authenticated: true, mode: 'loopback', username: null, loginAvailable: true }
    const token = getCookie(c, cookieName)
    const session = peer.secure && token ? sessions.get(tokenKey(token)) : undefined
    if (session && session.expires <= Date.now()) { sessions.delete(tokenKey(token!)); return { authenticated: false, mode: 'system', username: null, loginAvailable: peer.secure } }
    return { authenticated: !!session, mode: 'system', username: session?.username ?? null, loginAvailable: peer.secure }
  }
  async function login(c: ServerContext) {
    const peer = connection(c)
    if (!enabled || peer.local) return c.json(info(c))
    if (!peer.secure) return c.json({ error: { code: 'HTTPS_REQUIRED', message: '请通过 HTTPS 登录' } }, 403)
    const now = Date.now()
    prune(now)
    if (now >= windowEnds) { globalAttempts = 0; windowEnds = now + 60000 }
    const attempt = attempts.get(peer.address) ?? { count: 0, expires: now + 60000 }
    if (attempt.count >= 5 || globalAttempts >= 20 || verifying || (attempts.size >= 1024 && !attempts.has(peer.address))) {
      c.header('Retry-After', '60')
      return c.json({ error: { code: 'TOO_MANY_ATTEMPTS', message: '登录尝试过于频繁，请稍后再试' } }, 429)
    }
    attempt.count++; globalAttempts++; attempts.set(peer.address, attempt)
    if (!c.req.header('Content-Type')?.startsWith('application/json')) return c.json({ error: { code: 'INVALID_LOGIN', message: '登录请求必须使用 JSON' } }, 400)
    const data: unknown = await c.req.json().catch(() => null)
    if (!data || typeof data !== 'object' || !('username' in data) || !('password' in data)
      || typeof data.username !== 'string' || typeof data.password !== 'string'
      || !data.username.trim() || !data.password || data.username.length > 256 || data.password.length > 1024
      || data.username.includes('\0') || data.password.includes('\0')) {
      return c.json({ error: { code: 'INVALID_LOGIN', message: '请输入有效的系统账号和密码' } }, 400)
    }
    if (verifying) {
      data.password = ''
      c.header('Retry-After', '60')
      return c.json({ error: { code: 'TOO_MANY_ATTEMPTS', message: '登录验证正在进行，请稍后再试' } }, 429)
    }
    verifying = true
    let username: string | null
    try { username = await authenticator.authenticate(data.username.trim(), data.password) }
    finally { data.password = ''; verifying = false }
    if (!username) return c.json({ error: { code: 'INVALID_CREDENTIALS', message: '账号、密码或系统登录权限不匹配' } }, 401)
    const previous = getCookie(c, cookieName)
    if (previous) sessions.delete(tokenKey(previous))
    if (sessions.size >= 256) sessions.delete(sessions.keys().next().value!)
    const token = randomBytes(32).toString('base64url')
    sessions.set(tokenKey(token), { username, expires: Date.now() + sessionLifetime })
    setCookie(c, cookieName, token, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: sessionLifetime / 1000 })
    return c.json({ authenticated: true, mode: 'system', username, loginAvailable: true } satisfies SessionInfo)
  }
  function logout(c: ServerContext) {
    const token = getCookie(c, cookieName)
    if (token) sessions.delete(tokenKey(token))
    deleteCookie(c, cookieName, { secure: true, httpOnly: true, sameSite: 'Strict', path: '/' })
    return c.json(info(c).mode === 'disabled' ? info(c) : { authenticated: connection(c).local, mode: connection(c).local ? 'loopback' : 'system', username: null, loginAvailable: connection(c).secure } satisfies SessionInfo)
  }
  return { info, login, logout }
}
