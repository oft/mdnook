import { api } from '../../api'
import type { PreviewerNode } from '../types'

const filePreviewer: PreviewerNode = {
  id: 'file', label: '文件',
  prepare: async context => ({ file: await api.file(context.path, context.signal) }),
  load: () => import('./FilePreview.vue'),
}

export default filePreviewer
