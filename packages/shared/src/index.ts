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

/** Public metadata for a file inside the document root. MIME is inferred from its extension. */
export interface FileInfo {
  path: string
  name: string
  extension: string
  mediaType: string
  size: number
  modifiedAt: string
  assetUrl: string
  downloadUrl: string
}

export interface AppConfig {
  name: string
  version: string
  rootName: string
  rootId: string
}

export interface ApiError {
  error: { code: string; message: string }
}

export interface SessionInfo {
  authenticated: boolean
  mode: 'loopback' | 'system' | 'disabled'
  username: string | null
  loginAvailable: boolean
}

export type Reference =
  | { kind: 'external'; href: string }
  | { kind: 'local'; path: string; hash: string }

export type ResolvedReference =
  | { kind: 'external'; href: string }
  | { kind: 'document' | 'directory' | 'image' | 'asset'; path: string; hash: string }

export const imageMimeTypes: Readonly<Record<string, string>> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.bmp': 'image/bmp',
}

export const fileMimeTypes: Readonly<Record<string, string>> = {
  ...imageMimeTypes,
  '.md': 'text/markdown; charset=utf-8', '.markdown': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
}

export function fileExtension(path: string): string {
  return /\.[^./\\]+$/.exec(path)?.[0].toLowerCase() ?? ''
}

export function fileMediaType(path: string): string {
  return fileMimeTypes[fileExtension(path)] ?? 'application/octet-stream'
}

export function isInlineImage(path: string): boolean {
  return Object.hasOwn(imageMimeTypes, fileExtension(path))
}

/** Image families can have a preview pane even when no browser decoder is available. */
export function isImage(path: string): boolean {
  return isInlineImage(path) || /\.(tiff?|heic|heif|psd|raw|cr2|nef)$/i.test(path)
}

export function isMarkdown(path: string): boolean {
  return /\.(md|markdown)$/i.test(path)
}

/** Known text formats; SVG additionally offers a source view beside its image view. */
export function isText(path: string): boolean {
  return isMarkdown(path) || /\.(txt|text|log|json|html?|css|[cm]?js|jsx|tsx?|xml|svg|ya?ml|toml|ini|csv|sh|py|sql)$/i.test(path)
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

export function assetUrl(path: string, download = false): string {
  return `/api/assets?path=${encodeURIComponent(path)}${download ? '&download=1' : ''}`
}
