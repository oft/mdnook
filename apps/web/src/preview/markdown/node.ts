import type { PreviewerNode } from '../types'
import type { DocumentData } from '@mdnook/shared'

export default {
  id: 'markdown', label: 'Markdown',
  prepare: async context => ({ data: { text: await (context.data.readText as () => Promise<DocumentData>)() } }),
  load: () => import('./MarkdownPreview.vue'),
} satisfies PreviewerNode
