import { realpath } from 'node:fs/promises'
import { dirname, join, delimiter } from 'node:path'

export async function npmRuntime() {
  const candidates = [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')]
  if (process.env.npm_execpath?.replaceAll('\\', '/').includes('/npm/')) candidates.push(process.env.npm_execpath)
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    candidates.push(process.platform === 'win32' ? join(directory, 'node_modules/npm/bin/npm-cli.js') : join(directory, 'npm'))
  }
  for (const candidate of candidates) {
    try {
      const cli = await realpath(candidate)
      // Keep npm's network/cache settings; pnpm-only npm_config_* settings
      // otherwise become invalid flags when npm is launched from a pnpm script.
      const settings = new Set(['registry', 'cache', 'proxy', 'https_proxy', 'strict_ssl', 'cafile', 'userconfig'])
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
        !/^npm_config_/i.test(key) || settings.has(key.toLowerCase().slice('npm_config_'.length))))
      return { cli, env }
    } catch { /* Try next installation. */ }
  }
  throw new Error('没有找到 npm CLI，请安装包含 npm 的 Node.js 发行版')
}
