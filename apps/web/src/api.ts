import type { ApiError, AppConfig, DirectoryListing, DocumentData, FileInfo, ResolvedReference, SessionInfo } from '@mdnook/shared'

async function request<T>(endpoint: string, params: Record<string, string> = {}, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${endpoint}?${new URLSearchParams(params)}`, { ...init, signal, credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiError | null
    if (body?.error.code === 'AUTH_REQUIRED') window.dispatchEvent(new Event('mdnook-auth-required'))
    throw new Error(body?.error.message ?? `请求失败（${response.status}）`)
  }
  return response.json() as Promise<T>
}

export const api = {
  session: () => request<SessionInfo>('auth/session'),
  login: (username: string, password: string) => request<SessionInfo>('auth/login', {}, undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }),
  logout: () => request<SessionInfo>('auth/logout', {}, undefined, { method: 'POST' }),
  config: () => request<AppConfig>('config'),
  entries: (path: string, signal?: AbortSignal) => request<DirectoryListing>('entries', { path }, signal),
  file: (path: string, signal?: AbortSignal) => request<FileInfo>('file', { path }, signal),
  document: (path: string, signal?: AbortSignal) => request<DocumentData>('document', { path }, signal),
  text: (path: string, signal?: AbortSignal) => request<DocumentData>('text', { path }, signal),
  resolve: (from: string, href: string, signal?: AbortSignal) => request<ResolvedReference>('resolve', { from, href }, signal),
}
