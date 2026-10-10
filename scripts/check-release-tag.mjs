import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function validateReleaseTag(tag, manifest) {
  assert.match(tag ?? '', /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, '标签必须为 vX.X.X 稳定版本')
  assert.equal(manifest.name, 'mdnook', '发布入口必须是 mdnook')
  assert.notEqual(manifest.private, true, '不能发布私有包')
  assert.equal(tag.slice(1), manifest.version, `标签 ${tag} 与 mdnook 版本 ${manifest.version} 不一致`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const manifest = JSON.parse(await readFile(join(root, 'packages/cli/package.json'), 'utf8'))
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME
  validateReleaseTag(tag, manifest)
  console.log(`发布标签通过：${tag} → ${manifest.name}@${manifest.version}`)
}
