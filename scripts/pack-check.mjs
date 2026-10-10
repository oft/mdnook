import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join, delimiter, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(join(root, 'packages/cli/package.json'), 'utf8'))
const artifact = join(root, 'artifacts', `mdnook-${manifest.version}.tgz`)
await access(artifact).catch(() => { throw new Error('请先执行 pnpm pack:cli 生成安装包') })

async function findNpm() {
  const candidates = [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')]
  if (process.env.npm_execpath?.replaceAll('\\', '/').includes('/npm/')) candidates.push(process.env.npm_execpath)
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    candidates.push(process.platform === 'win32' ? join(directory, 'node_modules/npm/bin/npm-cli.js') : join(directory, 'npm'))
  }
  for (const candidate of candidates) {
    try { return await realpath(candidate) } catch { /* Try next installation. */ }
  }
  throw new Error('没有找到 npm CLI，请安装包含 npm 的 Node.js 发行版')
}

await mkdir(join(root, '.pack-check'), { recursive: true })
const temporary = await mkdtemp(join(root, '.pack-check', 'install-'))
const withinRoot = relative(root, temporary)
assert.ok(!isAbsolute(withinRoot) && !withinRoot.startsWith(`..${sep}`) && withinRoot !== '..')
let child
let output = ''
try {
  await writeFile(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  // pnpm exports its own settings as npm_config_*. Keep npm's network/cache
  // settings, but do not accidentally turn pnpm options into npm flags.
  const npmSettings = new Set(['registry', 'cache', 'proxy', 'https_proxy', 'strict_ssl', 'cafile', 'userconfig'])
  const installationEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^npm_config_/i.test(key) || npmSettings.has(key.toLowerCase().slice('npm_config_'.length))))
  const installation = spawnSync(process.execPath, [await findNpm(), 'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', artifact], { cwd: temporary, env: installationEnv, stdio: 'inherit' })
  assert.equal(installation.status, 0, '独立 npm 安装失败')
  const installed = join(temporary, 'node_modules/mdnook')
  const packaged = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'))
  assert.equal(packaged.version, manifest.version)
  assert.equal(packaged.repository.url, manifest.repository.url)
  assert.match(await readFile(join(installed, 'CHANGELOG.md'), 'utf8'), new RegExp(`## ${manifest.version.replaceAll('.', '\\.')}`))
  assert.equal(Object.keys(packaged.dependencies).some(name => name.startsWith('@mdnook/')), false)
  const executable = join(installed, packaged.bin.mdnook)
  const version = spawnSync(process.execPath, [executable, '--version'], { cwd: temporary, encoding: 'utf8' })
  assert.equal(version.stdout.trim(), manifest.version)
  const help = spawnSync(process.execPath, [executable, '--help'], { cwd: temporary, encoding: 'utf8' })
  assert.match(help.stdout, /--no-open/)
  const invalid = spawnSync(process.execPath, [executable, '--port', '0'], { cwd: temporary, encoding: 'utf8' })
  assert.notEqual(invalid.status, 0)
  const missing = spawnSync(process.execPath, [executable, 'non-existent-dir', '--no-open'], { cwd: temporary, encoding: 'utf8' })
  assert.notEqual(missing.status, 0)

  const docs = join(temporary, '我的 文档')
  await mkdir(docs)
  await writeFile(join(docs, 'README.md'), '# Independent package\n\nInstalled outside the source tree.')
  child = spawn(process.execPath, [executable, './我的 文档', '--no-open'], { cwd: temporary, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  const url = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`启动超时：${output}`)), 15000)
    const interval = setInterval(() => {
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output)
      if (match) { clearTimeout(deadline); clearInterval(interval); resolve(match[0]) }
    }, 50)
    child.once('error', error => { clearTimeout(deadline); clearInterval(interval); reject(error) })
    child.once('exit', code => { clearTimeout(deadline); clearInterval(interval); reject(new Error(`提前退出 ${code}：${output}`)) })
  })
  const config = await (await fetch(`${url}/api/config`)).json()
  assert.equal(config.rootName, '我的 文档')
  assert.equal(config.version, manifest.version)
  const doc = await (await fetch(`${url}/api/document?path=README.md`)).json()
  assert.match(doc.content, /Independent package/)
  const html = await (await fetch(`${url}/document?path=README.md`)).text()
  assert.match(html, /id="app"/)
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1])
  assert.ok(assets.length >= 2)
  for (const path of assets) assert.equal((await fetch(`${url}${path}`)).status, 200)
  assert.equal((await fetch(`${url}/api/missing`)).status, 404)
  const exit = new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject) })
  child.kill('SIGTERM')
  await exit
  const port = Number(new URL(url).port)
  await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(port, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolve()))
  })
  child = undefined
  console.log(`\n通过：mdnook-${manifest.version}.tgz 独立安装、命令参数、API、页面深链接、静态资源及端口释放。`)
} finally {
  if (child && child.exitCode === null) {
    const exit = new Promise(resolve => child.once('exit', resolve))
    child.kill('SIGTERM')
    await exit
  }
  // Checked absolute target is a unique directory underneath this workspace.
  await rm(temporary, { recursive: true, force: true })
}
