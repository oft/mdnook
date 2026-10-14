import type { PreviewerNode } from '../types'

export default {
  id: 'unsupported-file', label: '不支持的文件',
  load: () => import('./UnsupportedFilePreview.vue'),
} satisfies PreviewerNode
