import { isImage, isText } from '@mdnook/shared'
import type { FileTypeNode } from '../types'

export default {
  id: 'file', label: '文件', defaultPreviewer: 'unsupported-file',
  previewers: [{
    id: 'unsupported-file', label: '不支持的文件', supports: ['file'], fallback: true,
    loadNode: () => import('../../preview/file/unsupported.node'),
  }],
  children: [
    {
      id: 'text', label: '文本',
      matches: ({ file }) => isText(file.path) || file.mediaType.startsWith('text/') || file.mediaType.startsWith('application/json') || file.mediaType === 'image/svg+xml',
      loadType: () => import('../text/node'),
    },
    {
      id: 'image', label: '图片',
      matches: ({ file }) => isImage(file.path) || file.mediaType.startsWith('image/'),
      loadType: () => import('../image/node'),
    },
  ],
} satisfies FileTypeNode
