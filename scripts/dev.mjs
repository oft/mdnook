import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'
import { parseDevOptions, devEnvironment } from './dev-options.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
let options
try { options = parseDevOptions(process.argv.slice(2), process.cwd(), join(root, 'fixtures/docs')) }
catch (error) { console.error(`mdnook dev: ${error.message}`); process.exit(1) }
if (options.help) {
  console.log('用法：pnpm dev [directory] [--host IP] [--port 5173] [--api-port 8787]\n  --tls-cert FILE --tls-key FILE  开发 HTTPS，允许远程系统账号登录\n  --no-auth                      显式关闭账号认证，允许所有客户端读取文档\n  默认监听 0.0.0.0，回环免登录，非回环需要系统账号与 HTTPS。')
  process.exit(0)
}
try { if (options.tlsCert) { await access(options.tlsCert); await access(options.tlsKey) } }
catch { console.error('mdnook dev: 无法读取 HTTPS 证书或私钥'); process.exit(1) }
const env = devEnvironment(options)
console.log(options.authentication === 'disabled' ? '访问规则：已通过 --no-auth 关闭认证，所有客户端均可读取文档。' : '访问规则：回环地址免登录；非回环地址需要系统账号登录，密码登录需要 HTTPS。')
const tsxCli = join(root, 'node_modules/tsx/dist/cli.mjs')
const viteCli = join(root, 'apps/web/node_modules/vite/bin/vite.js')
const children = [
  spawn(process.execPath, [tsxCli, 'scripts/dev-server.ts', options.root], { cwd: root, env, stdio: 'inherit' }),
  spawn(process.execPath, [viteCli], { cwd: join(root, 'apps/web'), env, stdio: 'inherit' }),
]
let closing = false
function close(code = 0) {
  if (closing) return
  closing = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = code
}
for (const child of children) {
  child.on('error', error => { console.error(error.message); close(1) })
  child.on('exit', (code, signal) => { if (!closing) close(code ?? (signal ? 0 : 1)) })
}
process.once('SIGINT', () => close())
process.once('SIGTERM', () => close())
