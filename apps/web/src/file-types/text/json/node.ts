import type { DocumentData } from '@mdnook/shared'
import type { FileTypeNode, ParsedJson } from '../../types'
import json from '../../capabilities/json'

export default {
  id: 'json', label: 'JSON', defaultPreviewer: 'json-tree',
  capabilities: [json], preferredCapabilities: ['json', 'text'],
  prepare: async context => {
    let text: DocumentData
    try { text = await context.readText() }
    catch (error) { return { json: { error: error instanceof Error ? error.message : '无法读取 JSON' } satisfies ParsedJson } }
    try { return { text, json: { value: JSON.parse(text.content) } satisfies ParsedJson } }
    catch (error) { return { text, json: { error: (error as Error).message } satisfies ParsedJson } }
  },
  children: [{
    id: 'json-schema', label: 'JSON Schema',
    matches: ({ file, data }) => {
      const json = data.json as ParsedJson
      if (json.error) return false
      const value = json.value
      const schema = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
      return (typeof value === 'boolean' || !!schema) && (
        /(?:^|[.])schema\.json$/i.test(file.name) || typeof schema?.$schema === 'string'
      )
    },
    loadType: () => import('./schema'),
  }],
} satisfies FileTypeNode
