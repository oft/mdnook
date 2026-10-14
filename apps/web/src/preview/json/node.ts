import type { PreviewerNode } from '../types'

export default { id: 'json-tree', label: 'JSON 树', load: () => import('./JsonPreview.vue') } satisfies PreviewerNode
