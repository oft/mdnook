import type { FileCapability, FileTypeBranch, FileTypeContext, FileTypeNode, FileTypeReference, FileTypeResult, PreviewerOffer } from './types'

const definitions = new WeakMap<FileTypeReference, Promise<FileTypeNode>>()

async function definition(entry: FileTypeBranch): Promise<FileTypeNode> {
  if (!('loadType' in entry)) return entry
  let pending = definitions.get(entry)
  if (!pending) {
    pending = Promise.resolve().then(entry.loadType).then(module => {
      if (module.default.id !== entry.id) throw new Error('文件类型节点标识不一致')
      return module.default
    })
    definitions.set(entry, pending)
    pending.catch(() => definitions.delete(entry))
  }
  try { return await pending } catch { throw new Error(`无法加载${entry.label}类型识别器，请重试`) }
}

/** Follows one matching branch. Views stay unloaded; derived data belongs to this file session. */
export async function identifyFileType(root: FileTypeBranch, input: FileTypeContext): Promise<FileTypeResult> {
  const lineage: FileTypeNode[] = []
  const ancestors = new Set<FileTypeBranch>()
  const ids = new Set<string>()
  const previewers = new Map<string, PreviewerOffer>()
  const capabilities = new Map<string, FileCapability>()
  let preference: readonly string[] = []
  function offerPreviewer(offer: PreviewerOffer) {
    const existing = previewers.get(offer.id)
    if (existing && existing !== offer) throw new Error(`预览器标识重复：${offer.id}`)
    previewers.set(offer.id, offer)
  }
  let context = input
  let entry: FileTypeBranch | undefined = root
  while (entry) {
    context.signal.throwIfAborted()
    if (ancestors.has(entry) || ids.has(entry.id)) throw new Error('文件类型树存在循环引用')
    ancestors.add(entry)
    const node = await definition(entry)
    context.signal.throwIfAborted()
    if (node !== entry && ancestors.has(node)) throw new Error('文件类型树存在循环引用')
    ancestors.add(node)
    ids.add(node.id)
    const data = await node.prepare?.(context) ?? {}
    context.signal.throwIfAborted()
    context = { ...context, data: { ...context.data, ...data } }
    lineage.push(node)
    for (const capability of node.capabilities ?? []) {
      const existing = capabilities.get(capability.id)
      if (existing && existing !== capability) throw new Error(`文件能力标识重复：${capability.id}`)
      capabilities.set(capability.id, capability)
      for (const offer of capability.previewers ?? []) offerPreviewer(offer)
    }
    for (const offer of node.previewers ?? []) offerPreviewer(offer)
    if (node.preferredCapabilities) preference = [...node.preferredCapabilities, ...preference.filter(id => !node.preferredCapabilities!.includes(id))]
    const children: readonly FileTypeBranch[] = typeof node.children === 'function' ? await node.children(context) : node.children ?? []
    context.signal.throwIfAborted()
    entry = undefined
    for (const candidate of children) {
      const matches = await candidate.matches?.(context) ?? true
      context.signal.throwIfAborted()
      if (matches) { entry = candidate; break }
    }
  }
  const ordered = [...new Set([...preference, ...capabilities.keys()])].flatMap(id => capabilities.has(id) ? [capabilities.get(id)!] : [])
  return { lineage, context, previewers: [...previewers.values()], capabilities: ordered }
}
