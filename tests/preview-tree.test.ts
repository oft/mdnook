import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FileInfo } from '../packages/shared/src/index.js'
import { enterPreviewNode, preparedContext } from '../apps/web/src/preview/tree.js'
import type { PreviewContext, PreviewerBranch, PreviewerNode, PreviewerReference } from '../apps/web/src/preview/types.js'

const file: FileInfo = {
  path: 'images/example.svg', name: 'example.svg', extension: '.svg', mediaType: 'image/svg+xml',
  size: 123, modifiedAt: '2026-10-14T00:00:00.000Z',
  assetUrl: '/api/assets?path=images%2Fexample.svg', downloadUrl: '/api/assets?path=images%2Fexample.svg&download=1',
}
function context(signal = new AbortController().signal): PreviewContext {
  return { path: file.path, hash: '', file: null, signal, data: {} }
}

test('four levels inherit file information and load definitions and views only as each branch is entered', async () => {
  const loaded: string[] = []
  let fileReads = 0
  const load = (id: string) => async () => { loaded.push(id); return { default: { name: id } } }
  const reference = (node: PreviewerNode): PreviewerReference => ({
    id: node.id, label: node.label, matches: node.matches,
    loadNode: async () => { loaded.push(`${node.id}-definition`); return { default: node } },
  })
  const leaf: PreviewerNode = {
    id: 'drawing', label: '绘图', load: load('drawing'),
    prepare: input => {
      assert.equal(input.file, file)
      assert.deepEqual(input.data, { family: 'image', source: '<svg />' })
      return { data: { ready: true } }
    },
  }
  const svg: PreviewerNode = {
    id: 'svg', label: 'SVG', matches: input => input.file?.extension === '.svg', load: load('svg'),
    prepare: () => ({ data: { source: '<svg />' } }),
    children: async input => { assert.equal(input.data.source, '<svg />'); return [reference(leaf)] },
  }
  const image: PreviewerNode = {
    id: 'image', label: '图片', matches: input => input.file?.mediaType.startsWith('image/') ?? false,
    prepare: () => ({ data: { family: 'image' } }), load: load('image'),
    children: [reference(svg), { id: 'bitmap', label: '位图', loadNode: async () => { throw new Error('unselected definition must not load') } }],
  }
  const root: PreviewerNode = {
    id: 'file', label: '文件', prepare: () => { fileReads++; return { file } }, load: load('file'),
    children: [{ id: 'markdown', label: 'Markdown', matches: () => false, loadNode: async () => { throw new Error('unselected definition must not load') } }, reference(image)],
  }
  const ancestors: PreviewerBranch[] = []
  let input = context()
  let node: PreviewerBranch | undefined = root
  while (node) {
    const result = await enterPreviewNode(node, input, ancestors)
    assert.equal(result.context.file, file)
    ancestors.push(node)
    if (node !== result.node) ancestors.push(result.node)
    node = result.child?.node
    input = result.context
  }
  assert.equal(fileReads, 1)
  assert.deepEqual(loaded, ['file', 'image-definition', 'image', 'svg-definition', 'svg', 'drawing-definition', 'drawing'])
  assert.equal(input.data.ready, true)
})

test('ordered asynchronous matching stops at the first match and fallback loads only on entry', async () => {
  const calls: string[] = []
  const selected: PreviewerNode = { id: 'selected', label: '命中', load: async () => { calls.push('load'); return { default: {} } } }
  const fallback: PreviewerNode = { id: 'fallback', label: '兜底', load: async () => { calls.push('fallback-load'); return { default: {} } } }
  const root: PreviewerNode = {
    id: 'root', label: '根', children: [
      { ...selected, matches: async () => { calls.push('miss'); return false } },
      { ...selected, matches: async () => { calls.push('match'); return true } },
      { ...selected, matches: () => { throw new Error('later rules must not run') } },
    ], fallback,
  }
  const result = await enterPreviewNode(root, context())
  assert.equal(result.child?.fallback, false)
  assert.deepEqual(calls, ['miss', 'match'])
  await enterPreviewNode(result.child!.node, result.context, [root])
  assert.deepEqual(calls, ['miss', 'match', 'load'])
  const miss = await enterPreviewNode({ ...root, children: [] }, context())
  assert.deepEqual(miss.child, { node: fallback, fallback: true })
  assert.equal(calls.includes('fallback-load'), false)
  await enterPreviewNode(fallback, miss.context)
  assert.equal(calls.at(-1), 'fallback-load')
})

test('abort during preparation prevents matching and component loading', async () => {
  const controller = new AbortController()
  let finish!: () => void
  const ready = new Promise<void>(resolve => { finish = resolve })
  let touched = false
  const node: PreviewerNode = {
    id: 'slow', label: '慢节点', prepare: async () => { await ready; return { file } },
    children: [{ id: 'child', label: '子节点', matches: () => { touched = true; return true } }],
    load: async () => { touched = true; return { default: {} } },
  }
  const pending = enterPreviewNode(node, context(controller.signal))
  controller.abort()
  finish()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(touched, false)
})

test('failed imports can retry and successful modules are reused for another file', async () => {
  let attempts = 0
  const node: PreviewerNode = {
    id: 'retry', label: '可重试', load: async () => {
      if (++attempts === 1) throw new Error('network failed')
      return { default: { name: 'RetryPreview' } }
    },
  }
  await assert.rejects(enterPreviewNode(node, context()), /无法加载可重试预览器/)
  const first = await enterPreviewNode(node, context())
  const second = await enterPreviewNode(node, { ...context(), path: 'another.svg' })
  assert.equal(first.component, second.component)
  assert.equal(attempts, 2)
})

test('failed definition imports retry while successful definitions are reused and prepare each context', async () => {
  let attempts = 0
  const paths: string[] = []
  const definition: PreviewerNode = { id: 'format', label: '格式', prepare: input => { paths.push(input.path); return {} } }
  const reference: PreviewerReference = {
    id: 'format', label: '格式', loadNode: async () => {
      if (++attempts === 1) throw new Error('network failed')
      return { default: definition }
    },
  }
  await assert.rejects(enterPreviewNode(reference, context()), /无法加载格式预览器定义/)
  const first = await enterPreviewNode(reference, context())
  const second = await enterPreviewNode(reference, { ...context(), path: 'another.svg' })
  assert.equal(first.node, definition)
  assert.equal(second.node, definition)
  assert.equal(attempts, 2)
  assert.deepEqual(paths, [file.path, 'another.svg'])
})

test('abort during a definition import prevents its preparation and view load but allows module reuse', async () => {
  const controller = new AbortController()
  let finish!: (module: { default: PreviewerNode }) => void
  const ready = new Promise<{ default: PreviewerNode }>(resolve => { finish = resolve })
  let prepared = 0
  let loaded = 0
  let imported = 0
  const definition: PreviewerNode = {
    id: 'slow', label: '慢节点', prepare: () => { prepared++; return {} },
    load: async () => { loaded++; return { default: {} } },
  }
  const reference: PreviewerReference = { id: 'slow', label: '慢节点', loadNode: () => { imported++; return ready } }
  const pending = enterPreviewNode(reference, context(controller.signal))
  controller.abort()
  finish({ default: definition })
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(prepared, 0)
  assert.equal(loaded, 0)
  await enterPreviewNode(reference, context())
  assert.equal(imported, 1)
  assert.equal(prepared, 1)
  assert.equal(loaded, 1)
})

test('lazy aliases cannot reenter an ancestor definition and invalid module identities can retry', async () => {
  const definition: PreviewerNode = { id: 'cycle', label: '节点' }
  const reference: PreviewerReference = { id: 'cycle', label: '节点', loadNode: async () => ({ default: definition }) }
  await assert.rejects(enterPreviewNode(reference, context(), [definition]), /循环引用/)
  assert.equal((await enterPreviewNode(reference, context())).node, definition)
  let repaired = false
  const invalid: PreviewerReference = {
    id: 'cycle', label: '节点', loadNode: async () => ({ default: repaired ? definition : { ...definition, id: 'wrong' } }),
  }
  await assert.rejects(enterPreviewNode(invalid, context()), /无法加载节点预览器定义/)
  repaired = true
  assert.equal((await enterPreviewNode(invalid, context())).node, definition)
})

test('fallback definitions stay unloaded until the parent enters its fallback branch', async () => {
  let imported = 0
  const definition: PreviewerNode = { id: 'fallback', label: '兜底' }
  const fallback: PreviewerReference = { id: 'fallback', label: '兜底', loadNode: async () => { imported++; return { default: definition } } }
  const root: PreviewerNode = { id: 'root', label: '根', fallback }
  const parent = await enterPreviewNode(root, context())
  assert.equal(parent.child?.fallback, true)
  assert.equal(imported, 0)
  assert.equal((await enterPreviewNode(parent.child!.node, parent.context, [root])).node, definition)
  assert.equal(imported, 1)
})

test('a repeated ancestor is rejected while the same node can be reused across separate branches', async () => {
  const node: PreviewerNode = { id: 'cycle', label: '节点' }
  await assert.rejects(enterPreviewNode(node, context(), [node]), /循环引用/)
  assert.equal((await enterPreviewNode(node, context())).child, null)
})

test('parent UI data and hash remain live alongside a node preparation result', () => {
  const input = { ...context(), file, data: { image: { fit: true } } }
  const preparation = { data: { parsed: 'source' } }
  const original = preparedContext(input, preparation)
  const changed = preparedContext({ ...input, hash: '#heading', data: { image: { fit: false } } }, preparation)
  assert.deepEqual(original.data, { image: { fit: true }, parsed: 'source' })
  assert.deepEqual(changed.data, { image: { fit: false }, parsed: 'source' })
  assert.equal(changed.hash, '#heading')
  assert.equal(changed.signal, input.signal)
  assert.equal(changed.file, file)
})
