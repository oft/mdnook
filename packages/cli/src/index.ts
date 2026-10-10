import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command, InvalidArgumentError } from 'commander'
import open from 'open'
import { startServer } from '@mdnook/server'

const program = new Command()
  .name('mdnook')
  .description('在浏览器中查看本地 Markdown 目录文档')
  .version(__MDNOOK_VERSION__)
  .argument('[directory]', '文档根目录', '.')
  .option('-p, --port <number>', '服务端口（默认 8787，自动避开占用）', value => {
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
      throw new InvalidArgumentError('端口必须是 1–65535 的整数')
    }
    return Number(value)
  })
  .option('--no-open', '启动服务后不自动打开浏览器')
  .addHelpText('after', '\n示例：\n  mdnook\n  mdnook ./docs\n  mdnook ./docs --port 9000 --no-open\n\n按 Ctrl+C 关闭服务。')

program.action(async (directory: string, options: { port?: number; open: boolean }) => {
  try {
    const runtime = await startServer({
      root: resolve(directory),
      frontendDir: fileURLToPath(new URL('./public/', import.meta.url)),
      version: __MDNOOK_VERSION__,
      port: options.port,
      strictPort: options.port !== undefined,
    })
    console.log(`\n  mdnook v${__MDNOOK_VERSION__}\n`)
    console.log(`  文档目录  ${runtime.store.root}`)
    console.log(`  浏览地址  ${runtime.url}`)
    console.log('  按 Ctrl+C 关闭服务。\n')
    let closing = false
    const shutdown = () => {
      if (closing) return
      closing = true
      void runtime.close().then(() => process.exit(0), () => process.exit(1))
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
    if (options.open) {
      try { await open(runtime.url) } catch {
        console.warn(`  无法自动打开浏览器，请手动访问 ${runtime.url}`)
      }
    }
  } catch (error) {
    console.error(`mdnook: ${(error as Error).message}`)
    process.exitCode = 1
  }
})

await program.parseAsync()

declare const __MDNOOK_VERSION__: string
