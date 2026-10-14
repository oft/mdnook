import type { FileCapability } from '../types'

export default {
  id: 'image', label: '图片显示', defaultPreviewer: 'image',
  previewers: [{ id: 'image', label: '图片', icon: 'image', downloadLabel: '下载图片', requires: ['image'], loadNode: () => import('../../preview/image/node') }],
} satisfies FileCapability
