import type { PreviewerNode } from '../types'

export default { id: 'schema', label: 'Schema 概览', load: () => import('./SchemaPreview.vue') } satisfies PreviewerNode
