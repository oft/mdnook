import { startServer } from '../packages/server/src/index.js'

const runtime = await startServer({ root: process.argv[2] ?? '.', port: Number(process.env.MDNOOK_DEV_API_PORT || 8787), strictPort: true, authentication: process.env.MDNOOK_DEV_AUTH === 'disabled' ? 'disabled' : 'system' })
console.log(`独立本机 API: ${runtime.url}\n前端 API 直接使用 Vite 客户端连接\n文档: ${runtime.store.root}`)
const stop = () => { void runtime.close().then(() => process.exit(0)) }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
