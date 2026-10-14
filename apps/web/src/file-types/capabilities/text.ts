import source from '../../preview/text/entry'
import type { FileCapability } from '../types'

export default { id: 'text', label: '文本读取', previewers: [source], defaultPreviewer: 'source' } satisfies FileCapability
