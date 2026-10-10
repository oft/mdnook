import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout } from 'node:timers/promises'
import { artifactIntegrity, publishedVersion, verifyPublishedVersion } from './npm-registry.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(join(root, 'packages/cli/package.json'), 'utf8'))
const artifact = join(root, 'artifacts', `mdnook-${manifest.version}.tgz`)
const integrity = await artifactIntegrity(artifact)
// A successful upload can precede registry metadata availability. Poll only;
// never retry npm publish after a successful upload.
let available = false
for (let attempt = 1; attempt <= 12; attempt++) {
  const metadata = await publishedVersion(manifest.name, manifest.version)
  if (metadata) {
    verifyPublishedVersion(metadata, manifest, integrity)
    available = true
    console.log(`registry 验证通过：${manifest.name}@${manifest.version}，安装包 SHA-512 一致`)
    break
  }
  console.log(`等待 registry metadata（${attempt}/12）`)
  if (attempt < 12) await setTimeout(5000)
}
if (!available) throw new Error('安装包已上传，但 registry metadata 暂未可用。请稍后查询或重新运行工作流，不要重复发布。')
