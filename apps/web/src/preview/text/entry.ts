import type { PreviewerOffer } from '../../file-types/types'

export default {
  id: 'source', label: '源码', icon: 'file', requires: ['text'],
  loadNode: () => import('./node'),
} satisfies PreviewerOffer
