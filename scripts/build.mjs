import { mkdir, cp, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(join(root, 'packages/cli/package.json'), 'utf8'))
const cliDir = join(root, 'packages/cli/dist')
// All cleanup paths are fixed descendants of this workspace.
await rm(cliDir, { recursive: true, force: true })
const viteCli = join(root, 'apps/web/node_modules/vite/bin/vite.js')
const vite = spawnSync(process.execPath, [viteCli, 'build'], { cwd: join(root, 'apps/web'), stdio: 'inherit' })
if (vite.status !== 0) process.exit(vite.status ?? 1)
await mkdir(cliDir, { recursive: true })
await build({
  entryPoints: [join(root, 'packages/cli/src/index.ts')],
  outfile: join(cliDir, 'cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: Object.keys(manifest.dependencies),
  define: { __MDNOOK_VERSION__: JSON.stringify(manifest.version) },
  banner: { js: '#!/usr/bin/env node' },
})
await cp(join(root, 'apps/web/dist'), join(cliDir, 'public'), { recursive: true })
await cp(join(root, 'README.md'), join(root, 'packages/cli/README.md'))
await cp(join(root, 'LICENSE'), join(root, 'packages/cli/LICENSE'))
await cp(join(root, 'CHANGELOG.md'), join(root, 'packages/cli/CHANGELOG.md'))
console.log(`mdnook ${manifest.version} → packages/cli/dist`)
