import type { Component } from 'vue'
import type { PreviewContext, PreviewerBranch, PreviewerNode, PreviewerReference, PreviewPreparation, PreviewSelection } from './types'

const modules = new WeakMap<PreviewerNode, Promise<Component>>()
const definitions = new WeakMap<PreviewerReference, Promise<PreviewerNode>>()

async function loadDefinition(entry: PreviewerBranch): Promise<PreviewerNode> {
  if (!('loadNode' in entry)) return entry
  let pending = definitions.get(entry)
  if (!pending) {
    pending = Promise.resolve().then(entry.loadNode).then(module => {
      if (module.default.id !== entry.id) throw new Error('预览器节点标识不一致')
      return module.default
    })
    definitions.set(entry, pending)
    pending.catch(() => { definitions.delete(entry) })
  }
  try { return await pending } catch {
    throw new Error(`无法加载${entry.label}预览器定义，请重试`)
  }
}

async function loadComponent(node: PreviewerNode): Promise<Component | null> {
  if (!node.load) return null
  let pending = modules.get(node)
  if (!pending) {
    pending = Promise.resolve().then(node.load).then(module => module.default)
    modules.set(node, pending)
    pending.catch(() => { modules.delete(node) })
  }
  try { return await pending } catch {
    throw new Error(`无法加载${node.label}预览器，请重试`)
  }
}

/** Patches derived data without freezing inherited UI state such as the current hash. */
export function preparedContext(input: PreviewContext, preparation: PreviewPreparation): PreviewContext {
  const file = preparation.file ?? input.file
  return { ...input, path: file?.path ?? input.path, file, data: { ...input.data, ...preparation.data } }
}

export async function enterPreviewNode(entry: PreviewerBranch, input: PreviewContext, ancestors: readonly PreviewerBranch[] = []) {
  if (ancestors.includes(entry)) throw new Error('预览器树存在循环引用')
  input.signal.throwIfAborted()
  const node = await loadDefinition(entry)
  input.signal.throwIfAborted()
  if (ancestors.includes(node)) throw new Error('预览器树存在循环引用')
  const preparation = await node.prepare?.(input) ?? {}
  input.signal.throwIfAborted()
  const context = preparedContext(input, preparation)
  const children = typeof node.children === 'function' ? await node.children(context) : node.children ?? []
  input.signal.throwIfAborted()
  let child: PreviewSelection | null = null
  for (const candidate of children) {
    const matches = await candidate.matches?.(context) ?? true
    input.signal.throwIfAborted()
    if (matches) { child = { node: candidate, fallback: false }; break }
  }
  if (!child && node.fallback) child = { node: node.fallback, fallback: true }
  const component = await loadComponent(node)
  input.signal.throwIfAborted()
  return { node, preparation, context, child, component }
}
