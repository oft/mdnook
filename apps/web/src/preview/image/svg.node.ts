import type { PreviewerNode } from '../types'

export default {
  id: 'svg', label: 'SVG',
  load: () => import('./SvgPreview.vue'),
} satisfies PreviewerNode
