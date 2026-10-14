import { isInlineImage } from '@mdnook/shared'
import image from '../capabilities/image'
import type { FileTypeNode } from '../types'

export default {
  id: 'image', label: '图片', defaultPreviewer: 'image',
  capabilities: [image],
  children: [
    { id: 'bitmap', label: '位图', matches: ({ file }) => isInlineImage(file.path), loadType: () => import('./bitmap') },
  ],
} satisfies FileTypeNode
