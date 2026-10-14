import type { FileTypeNode } from '../types'

export default {
  id: 'bitmap', label: '位图',
  children: [
    { id: 'png', label: 'PNG', matches: ({ file }) => file.extension === '.png' },
    { id: 'jpeg', label: 'JPEG', matches: ({ file }) => ['.jpg', '.jpeg', '.jpe'].includes(file.extension) },
    { id: 'gif', label: 'GIF', matches: ({ file }) => file.extension === '.gif' },
    { id: 'webp', label: 'WebP', matches: ({ file }) => file.extension === '.webp' },
    { id: 'avif', label: 'AVIF', matches: ({ file }) => file.extension === '.avif' },
    { id: 'ico', label: 'ICO', matches: ({ file }) => file.extension === '.ico' },
    { id: 'bmp', label: 'BMP', matches: ({ file }) => file.extension === '.bmp' },
  ],
} satisfies FileTypeNode
