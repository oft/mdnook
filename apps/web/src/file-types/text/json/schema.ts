import type { FileTypeNode } from '../../types'

export default {
  id: 'json-schema', label: 'JSON Schema', defaultPreviewer: 'schema',
  previewers: [{ id: 'schema', label: 'Schema 概览', icon: 'file', supports: ['json-schema'], loadNode: () => import('../../../preview/schema/node') }],
} satisfies FileTypeNode
