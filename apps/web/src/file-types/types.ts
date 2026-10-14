import type { DocumentData, FileInfo } from '@mdnook/shared'
import type { PreviewerReference } from '../preview/types'

export interface FileTypeContext {
  file: FileInfo
  signal: AbortSignal
  data: Readonly<Record<string, unknown>>
  readText: () => Promise<DocumentData>
}

export interface PreviewerOffer extends PreviewerReference {
  /** Optional format constraint, including descendants. */
  supports?: readonly string[]
  /** All required capabilities must be present. */
  requires?: readonly string[]
  fallback?: boolean
}

export interface FileCapability {
  id: string
  label: string
  previewers?: readonly PreviewerOffer[]
  defaultPreviewer?: string
}

interface FileTypeMetadata {
  id: string
  label: string
  matches?: (context: FileTypeContext) => boolean | Promise<boolean>
}

export interface FileTypeReference extends FileTypeMetadata {
  loadType: () => Promise<{ default: FileTypeNode }>
}

export interface FileTypeNode extends FileTypeMetadata {
  prepare?: (context: FileTypeContext) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>
  children?: readonly FileTypeBranch[] | ((context: FileTypeContext) => Promise<readonly FileTypeBranch[]>)
  previewers?: readonly PreviewerOffer[]
  defaultPreviewer?: string
  capabilities?: readonly FileCapability[]
  /** Resolves overlapping capability defaults; descendants can override the order. */
  preferredCapabilities?: readonly string[]
}

export type FileTypeBranch = FileTypeNode | FileTypeReference

export interface FileTypeResult {
  lineage: readonly FileTypeNode[]
  context: FileTypeContext
  previewers: readonly PreviewerOffer[]
  capabilities: readonly FileCapability[]
}

export interface ParsedJson {
  value?: unknown
  error?: string
}
