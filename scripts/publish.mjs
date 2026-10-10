import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { npmRuntime } from './npm-runtime.mjs'
import { artifactIntegrity, publishedVersion, verifyPublishedVersion } from './npm-registry.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(join(root, 'packages/cli/package.json'), 'utf8'))
const artifact = join(root, 'artifacts', `mdnook-${manifest.version}.tgz`)
await access(artifact).catch(() => { throw new Error('请先执行 pnpm release:prepare 生成并验证安装包') })
const args = process.argv.slice(2)
if (!args.includes('--dry-run')) {
  const metadata = await publishedVersion(manifest.name, manifest.version)
  if (metadata) {
    verifyPublishedVersion(metadata, manifest, await artifactIntegrity(artifact))
    console.log(`${manifest.name}@${manifest.version} 已发布，安装包一致，跳过上传。`)
    process.exit(0)
  }
}
const { cli, env } = await npmRuntime()
console.log(`发布安装包：mdnook-${manifest.version}.tgz`)
const publication = spawnSync(process.execPath, [
  cli, 'publish', artifact,
  '--registry=https://registry.npmjs.org/', '--access=public', '--tag=latest',
  ...args,
], { cwd: root, env, stdio: 'inherit' })
if (publication.error) throw publication.error
process.exit(publication.status ?? 1)
