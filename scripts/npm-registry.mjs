import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

const registry = 'https://registry.npmjs.org/'

export async function artifactIntegrity(path) {
  return `sha512-${createHash('sha512').update(await readFile(path)).digest('base64')}`
}

export async function publishedVersion(name, version, baseUrl = registry) {
  const response = await fetch(new URL(`${encodeURIComponent(name)}/${encodeURIComponent(version)}`, baseUrl), {
    signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`npm registry 查询失败：HTTP ${response.status}`)
  return response.json()
}

export function verifyPublishedVersion(metadata, manifest, integrity) {
  assert.equal(metadata.name, manifest.name, 'registry 包名不一致')
  assert.equal(metadata.version, manifest.version, 'registry 版本不一致')
  assert.equal(metadata.dist?.integrity, integrity, '已发布版本与本次安装包不同；请升级版本后发布')
}

export async function waitForPublishedVersion(manifest, integrity, {
  timeoutMs = 10 * 60 * 1000,
  intervalMs = 10000,
  lookup = publishedVersion,
  onWait = () => {},
} = {}) {
  const deadline = Date.now() + timeoutMs
  let attempt = 0
  while (true) {
    const metadata = await lookup(manifest.name, manifest.version)
    if (metadata) {
      verifyPublishedVersion(metadata, manifest, integrity)
      return metadata
    }
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) throw new Error('npm 已接受安装包，但等待 registry metadata 超时。请稍后查询或重新运行工作流，不要重复发布。')
    onWait({ attempt: ++attempt, remainingMs })
    await setTimeout(Math.min(intervalMs, remainingMs))
  }
}
