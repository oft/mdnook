export interface Entry {
  name: string
  path: string
  kind: 'directory' | 'markdown' | 'file'
  size: number
  modifiedAt: string
}

export interface DirectoryListing {
  path: string
  entries: Entry[]
}

export interface DocumentData {
  path: string
  content: string
  modifiedAt: string
}

export interface AppConfig {
  name: string
  version: string
  rootName: string
}

export interface ApiError {
  error: { code: string; message: string }
}

export type Reference =
  | { kind: 'external'; href: string }
  | { kind: 'local'; path: string; hash: string }

export type ResolvedReference =
  | { kind: 'external'; href: string }
  | { kind: 'document' | 'directory' | 'asset'; path: string; hash: string }

export function isMarkdown(path: string): boolean {
  return /\.(md|markdown)$/i.test(path)
}

/** A portable path relative to the document root. Never silently clamps ../. */
export function normalizePath(input: string): string {
  const path = input.replaceAll('\\', '/')
  if (path.includes('\0') || path.includes(':')) throw new Error('无效的文件路径')
  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (!segments.length) throw new Error('链接超出了文档根目录')
      segments.pop()
    } else {
      segments.push(segment)
    }
  }
  return segments.join('/')
}

export function parentPath(path: string): string {
  const segments = normalizePath(path).split('/')
  segments.pop()
  return segments.join('/')
}

/** href has URL encoding, whereas from is an already decoded filesystem path. */
export function parseReference(from: string, href: string): Reference {
  const value = href.trim()
  if (value.startsWith('//')) return { kind: 'external', href: `https:${value}` }
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    if (!/^(https?:|mailto:|tel:)/i.test(value)) throw new Error('不支持此链接协议')
    return { kind: 'external', href: value }
  }
  const hashIndex = value.indexOf('#')
  const hash = hashIndex < 0 ? '' : decodeURIComponent(value.slice(hashIndex + 1))
  const withoutHash = hashIndex < 0 ? value : value.slice(0, hashIndex)
  const encodedPath = withoutHash.split('?')[0] ?? ''
  if (!encodedPath) return { kind: 'local', path: normalizePath(from), hash }
  const decoded = decodeURIComponent(encodedPath).replaceAll('\\', '/')
  const path = decoded.startsWith('/') ? decoded : `${parentPath(from)}/${decoded}`
  return { kind: 'local', path: normalizePath(path), hash }
}

export function assetUrl(path: string): string {
  return `/api/assets?path=${encodeURIComponent(path)}`
}
