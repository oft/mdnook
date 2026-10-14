import type { PreviewerNode } from '../types'

export default {
  id: 'unsupported-image', label: '不支持的图片',
  load: () => import('./UnsupportedImagePreview.vue'),
} satisfies PreviewerNode
