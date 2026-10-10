import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

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
