import type { DocumentData } from '@mdnook/shared'
import type { PreviewerNode } from '../types'

export default {
  id: 'source', label: '源码',
  prepare: async context => {
    if (context.data.text) return {}
    const readText = context.data.readText as (() => Promise<DocumentData>) | undefined
    if (!readText) throw new Error('预览上下文缺少文本读取入口')
    return { data: { text: await readText() } }
  },
  load: () => import('./SourcePreview.vue'),
} satisfies PreviewerNode
