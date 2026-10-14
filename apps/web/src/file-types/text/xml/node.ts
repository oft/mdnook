import type { FileTypeNode } from '../../types'

export default {
  id: 'xml', label: 'XML',
  children: [{ id: 'svg', label: 'SVG', matches: ({ file }) => file.extension === '.svg' || file.mediaType === 'image/svg+xml', loadType: () => import('./svg') }],
} satisfies FileTypeNode
