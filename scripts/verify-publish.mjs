import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { artifactIntegrity, waitForPublishedVersion } from './npm-registry.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(join(root, 'packages/cli/package.json'), 'utf8'))
const artifact = join(root, 'artifacts', `mdnook-${manifest.version}.tgz`)
const integrity = await artifactIntegrity(artifact)
// A successful upload can precede registry metadata availability. Poll only;
// never retry npm publish after a successful upload.
await waitForPublishedVersion(manifest, integrity, {
  onWait: ({ attempt, remainingMs }) => console.log(`等待 registry metadata（第 ${attempt} 次，剩余 ${Math.ceil(remainingMs / 1000)} 秒）`),
})
console.log(`registry 验证通过：${manifest.name}@${manifest.version}，安装包 SHA-512 一致`)
