import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assetUrl, isMarkdown, normalizePath, parentPath, parseReference } from '../packages/shared/src/index.js'

test('portable paths normalize separators without clamping out-of-root traversal', () => {
  assert.equal(normalizePath('指南\\子目录/../快速开始.md'), '指南/快速开始.md')
  assert.equal(normalizePath('/./指南//'), '指南')
  assert.equal(parentPath('指南/快速开始.md'), '指南')
  assert.equal(parentPath('README.md'), '')
  for (const path of ['../secret.md', '指南/../../secret.md', 'C:\\secret.md', 'file\0.md']) {
    assert.throws(() => normalizePath(path))
  }
})

test('Markdown references resolve from the document directory, including Unicode and anchors', () => {
  assert.deepEqual(parseReference('指南/快速开始.md', '../README.md#欢迎来到-mdnook'), { kind: 'local', path: 'README.md', hash: '欢迎来到-mdnook' })
  assert.deepEqual(parseReference('指南/快速开始.md', '#下一步-1'), { kind: 'local', path: '指南/快速开始.md', hash: '下一步-1' })
  assert.deepEqual(parseReference('指南/快速开始.md', '/项目示例/'), { kind: 'local', path: '项目示例', hash: '' })
  assert.deepEqual(parseReference('指南/快速开始.md', './带%20空格.md?v=2'), { kind: 'local', path: '指南/带 空格.md', hash: '' })
  assert.deepEqual(parseReference('指南/快速开始.md', './100%25%20完成%23记录.md'), { kind: 'local', path: '指南/100% 完成#记录.md', hash: '' })
  assert.deepEqual(parseReference('README.md', '%252e%252e/readme.md'), { kind: 'local', path: '%2e%2e/readme.md', hash: '' })
})

test('unsupported schemes, encoded traversal and malformed URLs are rejected', () => {
  for (const link of ['../../外部.md', '..%5c..%5csecret.md', 'javascript:alert(1)', 'file:///C:/secret.md', 'data:text/html,x', '%ZZ']) {
    assert.throws(() => parseReference('指南/快速开始.md', link))
  }
  assert.deepEqual(parseReference('README.md', 'https://example.com/docs'), { kind: 'external', href: 'https://example.com/docs' })
  assert.deepEqual(parseReference('README.md', '//example.com/docs'), { kind: 'external', href: 'https://example.com/docs' })
  assert.equal(isMarkdown('README.MD'), true)
  assert.equal(isMarkdown('notes.markdown'), true)
  assert.equal(assetUrl('images/a #%.png'), '/api/assets?path=images%2Fa%20%23%25.png')
})
