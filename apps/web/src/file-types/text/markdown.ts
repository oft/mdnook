import type { FileTypeNode } from '../types'

export default {
  id: 'markdown', label: 'Markdown', defaultPreviewer: 'markdown',
  previewers: [{
    id: 'markdown', label: 'Markdown', icon: 'file', downloadLabel: '下载 Markdown 源文件', supports: ['markdown'],
    loadNode: () => import('../../preview/markdown/node'),
  }],
} satisfies FileTypeNode
