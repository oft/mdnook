import type { FileCapability } from '../types'

export default {
  id: 'json', label: 'JSON 解析', defaultPreviewer: 'json-tree',
  previewers: [{ id: 'json-tree', label: 'JSON 树', icon: 'file', requires: ['json'], loadNode: () => import('../../preview/json/node') }],
} satisfies FileCapability
