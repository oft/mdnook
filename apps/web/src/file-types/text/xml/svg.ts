import image from '../../capabilities/image'
import type { FileTypeNode } from '../../types'

export default {
  id: 'svg', label: 'SVG', capabilities: [image], preferredCapabilities: ['image', 'text'], defaultPreviewer: 'image',
} satisfies FileTypeNode
