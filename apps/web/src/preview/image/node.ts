import { isInlineImage } from '@mdnook/shared'
import type { PreviewerNode } from '../types'

const imagePreviewer: PreviewerNode = {
  id: 'image', label: '图片',
  load: () => import('./ImagePreview.vue'),
  children: [
    {
      id: 'svg', label: 'SVG',
      matches: ({ file }) => file?.extension === '.svg' || file?.mediaType === 'image/svg+xml',
      loadNode: () => import('./svg.node'),
    },
    {
      id: 'bitmap', label: '位图',
      matches: ({ file }) => !!file && isInlineImage(file.path),
      loadNode: () => import('./bitmap.node'),
    },
  ],
  fallback: { id: 'unsupported-image', label: '不支持的图片', loadNode: () => import('./unsupported.node') },
}

export default imagePreviewer
