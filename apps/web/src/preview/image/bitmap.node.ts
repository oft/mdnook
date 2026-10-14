import type { PreviewerNode } from '../types'

export default {
  id: 'bitmap', label: '位图',
  load: () => import('./BitmapPreview.vue'),
} satisfies PreviewerNode
