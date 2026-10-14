import type { FileCapability, FileTypeNode, FileTypeResult, PreviewerOffer } from '../file-types/types'

export interface PreviewSettings {
  version: 2
  formatPreviewers: Record<string, string>
  capabilityPreviewers: Record<string, string>
  filePreviewers: Record<string, string>
}

export function emptyPreviewSettings(): PreviewSettings {
  return { version: 2, formatPreviewers: {}, capabilityPreviewers: {}, filePreviewers: {} }
}

export function compatiblePreviewers(previewers: readonly PreviewerOffer[], lineage: readonly FileTypeNode[], capabilities: readonly FileCapability[]): PreviewerOffer[] {
  return previewers.filter(offer =>
    (!offer.supports || offer.supports.some(id => lineage.some(type => type.id === id))) &&
    (!offer.requires || offer.requires.every(id => capabilities.some(capability => capability.id === id))),
  )
}

function own(map: Record<string, string>, key: string): string | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined
}

export function resolvePreviewer(result: FileTypeResult, settings: PreviewSettings, manual?: string) {
  const compatible = compatiblePreviewers(result.previewers, result.lineage, result.capabilities)
  const candidates: { id: string | undefined; source: string }[] = [
    { id: manual, source: '本次打开方式' },
    { id: own(settings.filePreviewers, result.context.file.path), source: '此文件默认' },
    ...[...result.lineage].reverse().map(type => ({ id: own(settings.formatPreviewers, type.id), source: `${type.label}格式默认` })),
    ...result.capabilities.map(capability => ({ id: own(settings.capabilityPreviewers, capability.id), source: `${capability.label}默认` })),
    ...[...result.lineage].reverse().filter(type => !compatible.find(offer => offer.id === type.defaultPreviewer)?.fallback).map(type => ({ id: type.defaultPreviewer, source: '内置默认' })),
    ...result.capabilities.map(capability => ({ id: capability.defaultPreviewer, source: '内置默认' })),
    ...compatible.filter(offer => offer.fallback).map(offer => ({ id: offer.id, source: '内置兜底' })),
  ]
  const ignored: string[] = []
  for (const candidate of candidates) {
    if (!candidate.id) continue
    const offer = compatible.find(viewer => viewer.id === candidate.id)
    if (offer) return { offer, source: candidate.source, ignored }
    ignored.push(`${candidate.source}的预览器“${candidate.id}”不可用`)
  }
  throw new Error('文件格式缺少兼容的兜底预览器')
}

function cleanMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([key, id]) => key.length > 0 && typeof id === 'string' && id.length > 0))
}

/** v1's text/image defaults become capabilities; concrete format and file choices survive. */
export function parsePreviewSettings(value: string | null): PreviewSettings {
  try {
    const raw: unknown = JSON.parse(value ?? '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyPreviewSettings()
    const result = emptyPreviewSettings()
    const data = raw as Record<string, unknown>
    if (data.version === 2) {
      result.formatPreviewers = cleanMap(data.formatPreviewers)
      result.capabilityPreviewers = cleanMap(data.capabilityPreviewers)
    } else if (data.version === undefined || data.version === 1) {
      const legacy = cleanMap(data.defaultPreviewers)
      result.formatPreviewers = Object.fromEntries(Object.entries(legacy).filter(([key]) => !['text', 'image'].includes(key)))
      result.capabilityPreviewers = Object.fromEntries(Object.entries(legacy).filter(([key]) => ['text', 'image'].includes(key)))
    } else return result
    result.filePreviewers = cleanMap(data.filePreviewers)
    return result
  } catch { return emptyPreviewSettings() }
}
