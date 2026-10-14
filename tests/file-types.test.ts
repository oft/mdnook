import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assetUrl, fileExtension, fileMediaType } from '../packages/shared/src/index.js'
import type { DocumentData, FileInfo } from '../packages/shared/src/index.js'
import root from '../apps/web/src/file-types/file/node.js'
import { identifyFileType } from '../apps/web/src/file-types/tree.js'
import { textResource } from '../apps/web/src/file-types/resources.js'
import sourceNode from '../apps/web/src/preview/text/node.js'
import type { FileTypeContext, FileTypeNode, FileTypeReference, ParsedJson } from '../apps/web/src/file-types/types.js'
import { compatiblePreviewers, emptyPreviewSettings, parsePreviewSettings, resolvePreviewer } from '../apps/web/src/preview/selection.js'

function file(path: string): FileInfo {
  return { path, name: path.split('/').at(-1)!, extension: fileExtension(path), mediaType: fileMediaType(path), size: 100, modifiedAt: '2026-10-14T00:00:00Z', assetUrl: assetUrl(path), downloadUrl: assetUrl(path, true) }
}
function input(path: string, content = '', signal = new AbortController().signal) {
  let reads = 0
  const info = file(path)
  const text: DocumentData = { path, content, modifiedAt: info.modifiedAt }
  const context: FileTypeContext = { file: info, signal, data: {}, readText: async () => { reads++; return text } }
  return { context, text, reads: () => reads }
}

test('real distributed types refine JSON Schema and share the text and parsed JSON with all viewers', async () => {
  const source = input('数据/例子.JSON', '{"$schema":"https://example.com/custom-dialect","type":"object","properties":{"title":{"type":"string"}}}')
  const result = await identifyFileType(root, source.context)
  assert.deepEqual(result.lineage.map(type => type.id), ['file', 'text', 'json', 'json-schema'])
  assert.equal(source.reads(), 1)
  assert.equal(result.context.data.text, source.text)
  assert.equal((result.context.data.json as ParsedJson).error, undefined)
  assert.deepEqual(compatiblePreviewers(result.previewers, result.lineage, result.capabilities).filter(offer => !offer.fallback).map(offer => offer.id), ['source', 'json-tree', 'schema'])
  assert.equal(resolvePreviewer(result, emptyPreviewSettings()).offer.id, 'schema')
})

test('default precedence is manual, file, nearest configured type, ancestor, then built-in', async () => {
  const result = await identifyFileType(root, input('example.schema.json', '{"type":"object"}').context)
  const settings = emptyPreviewSettings()
  settings.capabilityPreviewers.text = 'source'
  assert.equal(resolvePreviewer(result, settings).offer.id, 'source')
  settings.formatPreviewers.json = 'json-tree'
  assert.equal(resolvePreviewer(result, settings).offer.id, 'json-tree')
  settings.formatPreviewers['json-schema'] = 'schema'
  assert.equal(resolvePreviewer(result, settings).offer.id, 'schema')
  settings.filePreviewers[result.context.file.path] = 'json-tree'
  assert.equal(resolvePreviewer(result, settings).offer.id, 'json-tree')
  assert.equal(resolvePreviewer(result, settings, 'source').offer.id, 'source')
  delete settings.filePreviewers[result.context.file.path]
  delete settings.formatPreviewers['json-schema']
  assert.equal(resolvePreviewer(result, settings).source, 'JSON格式默认')
})

test('images do not read text, SVG offers source without multiple parents, and unsupported files remain downloadable', async () => {
  for (const [path, expected] of [['image.svg', ['file', 'text', 'xml', 'svg']], ['photo.PNG', ['file', 'image', 'bitmap', 'png']], ['raw.TIFF', ['file', 'image']], ['notes.bin', ['file']]] as const) {
    const source = input(path)
    const result = await identifyFileType(root, source.context)
    assert.deepEqual(result.lineage.map(type => type.id), expected)
    assert.equal(source.reads(), 0)
    const settings = emptyPreviewSettings()
    settings.filePreviewers[path] = 'source'
    const selected = resolvePreviewer(result, settings)
    assert.equal(selected.offer.id, path.endsWith('.svg') ? 'source' : path.endsWith('.bin') ? 'unsupported-file' : 'image')
    assert.equal(selected.ignored.length, path.endsWith('.svg') ? 0 : 1)
  }
})

test('invalid JSON preserves source and parse errors; schema recognition is limited to objects or booleans', async () => {
  const invalid = await identifyFileType(root, input('bad.schema.json', '{oops').context)
  assert.equal(invalid.lineage.at(-1)?.id, 'json')
  assert.ok((invalid.context.data.json as ParsedJson).error)
  assert.equal(resolvePreviewer(invalid, emptyPreviewSettings(), 'source').offer.id, 'source')
  assert.equal((await identifyFileType(root, input('array.schema.json', '[]').context)).lineage.at(-1)?.id, 'json')
  assert.equal((await identifyFileType(root, input('empty.schema.json', 'false').context)).lineage.at(-1)?.id, 'json-schema')
  assert.equal((await identifyFileType(root, input('ordinary.json', '{"type":"object"}').context)).lineage.at(-1)?.id, 'json')
  assert.equal((await identifyFileType(root, input('readme.MD', '# Title').context)).lineage.at(-1)?.id, 'markdown')
})

test('unknown and incompatible settings are skipped, while malformed persisted data and inherited keys are ignored', async () => {
  const settings = parsePreviewSettings('{"defaultPreviewers":{"json":"removed-viewer","text":"source","bad":{}},"filePreviewers":[]}')
  assert.deepEqual(settings, { version: 2, formatPreviewers: { json: 'removed-viewer' }, capabilityPreviewers: { text: 'source' }, filePreviewers: {} })
  assert.deepEqual(parsePreviewSettings('broken JSON'), emptyPreviewSettings())
  const result = await identifyFileType(root, input('example.json', 'null').context)
  const selected = resolvePreviewer(result, settings, 'schema')
  assert.equal(selected.offer.id, 'source')
  assert.equal(selected.ignored.length, 2)
  const inherited = { ...emptyPreviewSettings(), formatPreviewers: Object.create({ json: 'source' }) }
  assert.equal(resolvePreviewer(result, inherited).offer.id, 'json-tree')
})

test('SVG capability conflicts use image first, while nearer formats, file and manual choices override', async () => {
  const result = await identifyFileType(root, input('drawing.svg').context)
  assert.deepEqual(result.capabilities.map(capability => capability.id), ['image', 'text'])
  const settings = emptyPreviewSettings()
  settings.capabilityPreviewers.text = 'source'
  assert.equal(resolvePreviewer(result, settings).offer.id, 'source')
  settings.capabilityPreviewers.image = 'image'
  assert.equal(resolvePreviewer(result, settings).offer.id, 'image')
  settings.formatPreviewers.xml = 'source'
  assert.equal(resolvePreviewer(result, settings).offer.id, 'source')
  settings.formatPreviewers.svg = 'image'
  assert.equal(resolvePreviewer(result, settings).offer.id, 'image')
  settings.filePreviewers['drawing.svg'] = 'source'
  assert.equal(resolvePreviewer(result, settings).offer.id, 'source')
  assert.equal(resolvePreviewer(result, settings, 'image').offer.id, 'image')
  settings.capabilityPreviewers.image = 'schema'
  delete settings.filePreviewers['drawing.svg']
  delete settings.formatPreviewers.svg
  delete settings.formatPreviewers.xml
  assert.equal(resolvePreviewer(result, settings).offer.id, 'source')
  assert.equal(resolvePreviewer(result, settings).ignored.length, 1)
})

test('v1 settings migrate broad defaults to capabilities and preserve format and individual file associations', async () => {
  const settings = parsePreviewSettings(JSON.stringify({ defaultPreviewers: { text: 'source', image: 'image', svg: 'source', json: 'json-tree', bitmap: 'image' }, filePreviewers: { 'a.svg': 'image' } }))
  assert.deepEqual(settings.capabilityPreviewers, { text: 'source', image: 'image' })
  assert.deepEqual(settings.formatPreviewers, { svg: 'source', json: 'json-tree', bitmap: 'image' })
  assert.deepEqual(settings.filePreviewers, { 'a.svg': 'image' })
  assert.deepEqual(parsePreviewSettings(JSON.stringify(settings)), settings)
  assert.equal(resolvePreviewer(await identifyFileType(root, input('a.svg').context), settings).offer.id, 'image')
  assert.equal(resolvePreviewer(await identifyFileType(root, input('b.svg').context), settings).offer.id, 'source')
  assert.deepEqual(parsePreviewSettings('{"version":99,"filePreviewers":{"a":"source"}}'), emptyPreviewSettings())
  assert.equal(Object.hasOwn(parsePreviewSettings('{"version":2,"formatPreviewers":{"__proto__":"source"}}').formatPreviewers, '__proto__'), true)
})

test('SVG source failures leave image selection usable and lazy text retries/cache are scoped to the session', async () => {
  const original = input('drawing.svg', '<svg/>')
  let reads = 0
  original.context.readText = textResource(async () => {
    if (++reads === 1) throw new Error('文件超过文本读取上限')
    return original.text
  }, original.context.signal)
  const result = await identifyFileType(root, original.context)
  assert.equal(reads, 0)
  const context = { path: result.context.file.path, hash: '', file: result.context.file, signal: result.context.signal, data: { readText: result.context.readText } }
  await assert.rejects(sourceNode.prepare(context), /文本读取上限/)
  assert.equal(resolvePreviewer(result, emptyPreviewSettings(), 'image').offer.id, 'image')
  const [first, second] = await Promise.all([sourceNode.prepare(context), sourceNode.prepare(context)])
  assert.equal(first.data.text, original.text)
  assert.equal(second.data.text, original.text)
  assert.equal(reads, 2)
  await sourceNode.prepare(context)
  assert.equal(reads, 2)
  const controller = new AbortController()
  const read = textResource(async () => original.text, controller.signal)
  await read()
  controller.abort()
  assert.throws(read, { name: 'AbortError' })
})

test('capability requirements are composable and remain distinct from format inheritance', async () => {
  const result = await identifyFileType(root, input('drawing.svg').context)
  const offers = [
    { id: 'combined', label: '组合', requires: ['text', 'image'], loadNode: async () => sourceNode },
    { id: 'missing', label: '缺少能力', requires: ['text', 'json'], loadNode: async () => sourceNode },
    { id: 'xml-source', label: 'XML 源码', supports: ['xml'], requires: ['text'], loadNode: async () => sourceNode },
    { id: 'json-image', label: 'JSON 图片', supports: ['json'], requires: ['image'], loadNode: async () => sourceNode },
  ].map(offer => ({ ...offer, loadNode: async () => ({ default: sourceNode }) }))
  assert.deepEqual(compatiblePreviewers(offers, result.lineage, result.capabilities).map(offer => offer.id), ['combined', 'xml-source'])
  const markdown = input('readme.md', '# Title')
  await identifyFileType(root, markdown.context)
  assert.equal(markdown.reads(), 0)
})

test('type definitions load one branch, pass parent preparation down, and leave every view unloaded', async () => {
  const calls: string[] = []
  const child: FileTypeNode = {
    id: 'child', label: '子类型', prepare: context => { assert.equal(context.data.source, 'parent'); calls.push('prepare'); return { parsed: true } },
    previewers: [{ id: 'viewer', label: '视图', supports: ['child'], loadNode: async () => { throw new Error('view must stay lazy') } }],
  }
  const reference: FileTypeReference = { id: child.id, label: child.label, loadType: async () => { calls.push('import'); return { default: child } } }
  const parent: FileTypeNode = {
    id: 'parent', label: '父类型', prepare: () => ({ source: 'parent' }), children: [
      { id: 'miss', label: '未命中', matches: async () => false, loadType: async () => { throw new Error('must not import') } },
      reference,
      { id: 'later', label: '之后', matches: () => { throw new Error('must not match') }, loadType: async () => ({ default: child }) },
    ],
  }
  const result = await identifyFileType(parent, input('example.txt').context)
  assert.equal(result.context.data.parsed, true)
  await identifyFileType(parent, input('another.txt').context)
  assert.deepEqual(calls, ['import', 'prepare', 'prepare'])
})

test('type import failures can retry and cyclic aliases or mismatched identities are rejected', async () => {
  let attempts = 0
  const node: FileTypeNode = { id: 'retry', label: '重试' }
  const reference: FileTypeReference = { id: 'retry', label: '重试', loadType: async () => {
    if (++attempts === 1) return { default: { ...node, id: 'wrong' } }
    return { default: node }
  } }
  await assert.rejects(identifyFileType(reference, input('x').context), /无法加载/)
  await identifyFileType(reference, input('x').context)
  await identifyFileType(reference, input('y').context)
  assert.equal(attempts, 2)
  node.children = [reference]
  await assert.rejects(identifyFileType(reference, input('x').context), /循环引用/)
})

test('abort during type preparation prevents downstream matching and stale derived results', async () => {
  const controller = new AbortController()
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  let matched = false
  const node: FileTypeNode = {
    id: 'slow', label: '慢节点', prepare: async () => { await pending; return {} },
    children: [{ id: 'child', label: '子级', matches: () => { matched = true; return true } }],
  }
  const result = identifyFileType(node, input('x', '', controller.signal).context)
  controller.abort()
  finish()
  await assert.rejects(result, { name: 'AbortError' })
  assert.equal(matched, false)
})
