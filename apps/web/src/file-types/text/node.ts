import { isMarkdown } from '@mdnook/shared'
import text from '../capabilities/text'
import type { FileTypeNode } from '../types'

export default {
  id: 'text', label: '文本', defaultPreviewer: 'source',
  capabilities: [text],
  children: [
    { id: 'markdown', label: 'Markdown', matches: ({ file }) => isMarkdown(file.path), loadType: () => import('./markdown') },
    {
      id: 'xml', label: 'XML',
      matches: ({ file }) => ['.xml', '.svg'].includes(file.extension) || ['application/xml', 'text/xml', 'image/svg+xml'].includes(file.mediaType),
      loadType: () => import('./xml/node'),
    },
    {
      id: 'json', label: 'JSON',
      matches: ({ file }) => file.extension === '.json' || file.mediaType.startsWith('application/json'),
      loadType: () => import('./json/node'),
    },
  ],
} satisfies FileTypeNode
