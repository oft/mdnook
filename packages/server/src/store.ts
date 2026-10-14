import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import { assetUrl, fileExtension, fileMediaType, isImage, isMarkdown, isText, normalizePath, parseReference } from '@mdnook/shared'
import type { DirectoryListing, DocumentData, Entry, FileInfo, ResolvedReference } from '@mdnook/shared'

export class FileError extends Error {
  constructor(public code: string, message: string, public status: 400 | 403 | 404 | 413 | 415 | 500 = 400) {
    super(message)
  }
}

const excluded = new Set(['.git', 'node_modules'])
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })
const maxDocumentSize = 10 * 1024 * 1024

export class DocumentStore {
  private constructor(public readonly root: string) {}

  static async create(directory: string): Promise<DocumentStore> {
    try {
      const root = await realpath(directory)
      if (!(await stat(root)).isDirectory()) throw new FileError('NOT_DIRECTORY', '请指定一个文档目录')
      return new DocumentStore(root)
    } catch (error) {
      throw translateError(error)
    }
  }

  get rootName(): string { return basename(this.root) || this.root }

  /** realpath checks symlinks and Windows junctions, with a separator-aware boundary. */
  async locate(input: string): Promise<{ path: string; absolute: string }> {
    let path: string
    try { path = normalizePath(input) } catch (error) {
      throw new FileError('INVALID_PATH', (error as Error).message, 403)
    }
    if (path.split('/').some(segment => excluded.has(segment))) {
      throw new FileError('EXCLUDED_PATH', '该目录未开放浏览', 403)
    }
    try {
      const absolute = await realpath(join(this.root, path))
      const rel = relative(this.root, absolute)
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new FileError('OUTSIDE_ROOT', '链接超出了文档根目录', 403)
      }
      return { path, absolute }
    } catch (error) {
      throw translateError(error)
    }
  }

  async list(input: string): Promise<DirectoryListing> {
    const { path, absolute } = await this.locate(input)
    try {
      const dirents = await readdir(absolute, { withFileTypes: true })
      const entries = await Promise.all(dirents.filter(d => !excluded.has(d.name)).map(async d => {
        const childPath = path ? `${path}/${d.name}` : d.name
        try {
          const child = await this.locate(childPath)
          const info = await stat(child.absolute)
          if (!info.isDirectory() && !info.isFile()) return null
          return {
            name: d.name, path: childPath,
            kind: info.isDirectory() ? 'directory' : isMarkdown(d.name) ? 'markdown' : 'file',
            size: info.size, modifiedAt: info.mtime.toISOString(),
          } satisfies Entry
        } catch (error) {
          // Broken links, inaccessible children and links outside root are not navigable.
          if (error instanceof FileError && [403, 404].includes(error.status)) return null
          throw error
        }
      }))
      const visible = entries.filter((entry): entry is Entry => entry !== null)
      visible.sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || collator.compare(a.name, b.name))
      return { path, entries: visible }
    } catch (error) {
      throw translateError(error)
    }
  }

  async file(input: string): Promise<FileInfo> {
    const { path, absolute } = await this.locate(input)
    try {
      const info = await stat(absolute)
      if (!info.isFile()) throw new FileError('NOT_FILE', '目标不是文件', 415)
      return {
        path, name: basename(path), extension: fileExtension(path), mediaType: fileMediaType(path),
        size: info.size, modifiedAt: info.mtime.toISOString(),
        assetUrl: assetUrl(path), downloadUrl: assetUrl(path, true),
      }
    } catch (error) { throw translateError(error) }
  }

  async document(input: string): Promise<DocumentData> {
    const { path, absolute } = await this.locate(input)
    if (!isMarkdown(path)) throw new FileError('NOT_MARKDOWN', '请选择 Markdown 文件', 415)
    try {
      const info = await stat(absolute)
      if (!info.isFile()) throw new FileError('NOT_FILE', '目标不是文档文件', 415)
      if (info.size > maxDocumentSize) throw new FileError('DOCUMENT_TOO_LARGE', '文档超过 10 MiB，无法预览', 413)
      return { path, content: await readFile(absolute, 'utf8'), modifiedAt: info.mtime.toISOString() }
    } catch (error) { throw translateError(error) }
  }

  async text(input: string): Promise<DocumentData> {
    const { path, absolute } = await this.locate(input)
    if (!isText(path)) throw new FileError('NOT_TEXT', '此文件格式暂不支持文本预览', 415)
    try {
      const info = await stat(absolute)
      if (!info.isFile()) throw new FileError('NOT_FILE', '目标不是文件', 415)
      if (info.size > maxDocumentSize) throw new FileError('TEXT_TOO_LARGE', '文本超过 10 MiB，无法预览', 413)
      const bytes = await readFile(absolute)
      if (bytes.length > maxDocumentSize) throw new FileError('TEXT_TOO_LARGE', '文本超过 10 MiB，无法预览', 413)
      let content: string
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
      catch { throw new FileError('INVALID_TEXT', '文本不是有效的 UTF-8 编码', 415) }
      if (content.includes('\0')) throw new FileError('INVALID_TEXT', '文件包含二进制内容，无法作为文本预览', 415)
      return { path, content, modifiedAt: info.mtime.toISOString() }
    } catch (error) { throw translateError(error) }
  }

  async resolve(from: string, href: string): Promise<ResolvedReference> {
    let reference
    try { reference = parseReference(from, href) } catch (error) {
      throw new FileError('INVALID_LINK', (error as Error).message)
    }
    if (reference.kind === 'external') return reference
    const target = await this.locate(reference.path)
    try {
      const info = await stat(target.absolute)
      if (!info.isFile() && !info.isDirectory()) throw new FileError('NOT_FILE', '不支持此文件类型', 415)
      return {
        kind: info.isDirectory() ? 'directory' : isMarkdown(target.path) ? 'document' : isImage(target.path) ? 'image' : 'asset',
        path: target.path, hash: reference.hash,
      }
    } catch (error) { throw translateError(error) }
  }
}

export function translateError(error: unknown): FileError {
  if (error instanceof FileError) return error
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'ENOENT') return new FileError('NOT_FOUND', '文件或目录不存在，可能已被移动或删除', 404)
  if (code === 'ENOTDIR' || code === 'EISDIR') return new FileError('NOT_DIRECTORY', '目标类型不正确', 400)
  if (code === 'EACCES' || code === 'EPERM') return new FileError('ACCESS_DENIED', '没有读取此文件或目录的权限', 403)
  return new FileError('READ_FAILED', '读取失败，请检查目录是否可访问', 500)
}
