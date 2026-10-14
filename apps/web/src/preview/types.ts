import type { Component } from 'vue'
import type { FileInfo } from '@mdnook/shared'

export interface PreviewContext {
  path: string
  hash: string
  file: FileInfo | null
  signal: AbortSignal
  data: Readonly<Record<string, unknown>>
}

export interface PreviewPreparation {
  file?: FileInfo
  data?: Readonly<Record<string, unknown>>
}

export interface PreviewRequest {
  from: string
  href: string
}

export interface OpenWithRequest {
  path: string
  sequence: number
  x: number
  y: number
}

export interface PreviewReport {
  type: string
  data?: Readonly<Record<string, unknown>>
}

interface PreviewerMetadata {
  id: string
  label: string
  icon?: string
  downloadLabel?: string
  matches?: (context: PreviewContext) => boolean | Promise<boolean>
}

/** A parent only needs metadata, a matching rule and the child's module entry point. */
export interface PreviewerReference extends PreviewerMetadata {
  loadNode: () => Promise<{ default: PreviewerNode }>
}

export type PreviewerBranch = PreviewerNode | PreviewerReference

/** Every level owns its processing, view and immediate children. */
export interface PreviewerNode extends PreviewerMetadata {
  prepare?: (context: PreviewContext) => PreviewPreparation | Promise<PreviewPreparation>
  load?: () => Promise<{ default: Component }>
  children?: readonly PreviewerBranch[] | ((context: PreviewContext) => Promise<readonly PreviewerBranch[]>)
  fallback?: PreviewerBranch
}

export interface PreviewSelection { node: PreviewerBranch; fallback: boolean }

export interface PreviewComponentProps {
  context: PreviewContext
  node: PreviewerNode
  child: PreviewerBranch | null
  childIsFallback: boolean
}

export interface PreviewSlotBinding {
  context?: PreviewContext
  onReport?: (report: PreviewReport) => void
}

export interface ImageSize { width: number; height: number }

export function requirePreviewFile(context: PreviewContext): FileInfo {
  if (!context.file) throw new Error('预览上下文缺少文件信息')
  return context.file
}
