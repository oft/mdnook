import { startServer } from '../packages/server/src/index.js'

const runtime = await startServer({ root: process.argv[2] ?? '.', port: 8787, strictPort: true })
console.log(`API: ${runtime.url}\n前端: http://127.0.0.1:5173\n文档: ${runtime.store.root}`)
const stop = () => { void runtime.close().then(() => process.exit(0)) }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
