import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tsxCli = join(root, 'node_modules/tsx/dist/cli.mjs')
const viteCli = join(root, 'apps/web/node_modules/vite/bin/vite.js')
const children = [
  spawn(process.execPath, [tsxCli, 'scripts/dev-server.ts', resolve(process.argv[2] ?? join(root, 'fixtures/docs'))], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, [viteCli], { cwd: join(root, 'apps/web'), stdio: 'inherit' }),
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
