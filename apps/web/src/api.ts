import type { ApiError, AppConfig, DirectoryListing, DocumentData, ResolvedReference } from '@mdnook/shared'

async function request<T>(endpoint: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${endpoint}?${new URLSearchParams(params)}`, { signal })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiError | null
    throw new Error(body?.error.message ?? `请求失败（${response.status}）`)
  }
  return response.json() as Promise<T>
}

export const api = {
  config: () => request<AppConfig>('config'),
  entries: (path: string, signal?: AbortSignal) => request<DirectoryListing>('entries', { path }, signal),
  document: (path: string, signal?: AbortSignal) => request<DocumentData>('document', { path }, signal),
  resolve: (from: string, href: string) => request<ResolvedReference>('resolve', { from, href }),
}
