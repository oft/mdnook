# mdnook

在浏览器中查看本地文档目录。左侧目录树、当前目录文件列表与文件预览同时显示，支持 Markdown、图片、UTF-8 文本、JSON 和 JSON Schema。

包版本：`0.0.3`。源码仓库：[oft/mdnook](https://github.com/oft/mdnook)。

## 使用

需要 Node.js **22.12 或更新版本**。包发布后可使用：

```bash
npx mdnook
npx mdnook ./docs
npx mdnook ./docs --port 9000 --no-open

npm install -g mdnook
mdnook .
```

默认以当前工作目录作为文档根目录，绑定 `127.0.0.1:8787`，服务就绪后打开浏览器。默认端口占用时尝试后续 20 个端口；显式 `--port` 被占用则退出并提示。按 Ctrl+C 关闭服务。

| 参数 | 说明 |
| --- | --- |
| `[directory]` | 文档根目录，默认 `.` |
| `-p, --port <number>` | 指定端口，范围 1–65535 |
| `--host <address>` | 监听 IPv4 / IPv6 地址，默认 `127.0.0.1`；启用认证时非回环监听需要 HTTPS |
| `--tls-cert <file>` | HTTPS 证书 PEM 文件 |
| `--tls-key <file>` | HTTPS 私钥 PEM 文件，与证书同时指定 |
| `--no-auth` | 显式关闭账号认证，允许所有客户端读取文档，可使用 HTTP |
| `--no-open` | 不自动打开浏览器 |
| `-h, --help` | 帮助 |
| `-V, --version` | 版本 |

## 系统账号与访问权限

API 根据实际 TCP 客户端地址判断：`127.0.0.0/8`、`::1` 及对应的 IPv4 映射地址免登录；非回环请求需要输入**启动程序的系统账号和密码**。账号身份由操作系统验证，文件访问继续使用启动进程的系统权限，且始终限定在指定的文档根目录内。没有自建用户或密码库。

本机默认用法不变。远程访问示例：

```bash
mdnook ./docs --host 0.0.0.0 --tls-cert ./cert.pem --tls-key ./key.pem --no-open
```

其他设备使用 `https://服务端IP:8787` 打开登录页；证书需要覆盖访问的 IP 并被客户端信任。启用认证时，非回环监听缺少证书或私钥会拒绝启动。用户名、密码不写入日志、配置、命令行参数或浏览器存储；登录后使用 30 分钟的内存会话，支持退出，服务重启后全部失效。

明确需要免登录共享时，可执行 `mdnook ./docs --host 0.0.0.0 --no-auth --no-open`。控制台和页面会显示免认证模式；根目录边界、文件权限和来源检查仍然生效。

Windows 调用系统 `LogonUserW`，比较 SID，只允许启动账号；请输入账号密码，Windows Hello PIN 不适用。Linux / macOS 调用 PAM 的 `login` 策略，同时验证密码与账号有效性，需要 `/usr/bin/python3` 和系统 PAM；系统策略或组件不可用时拒绝登录。Linux / macOS 尚未完成真机验证。

回环免登录也适用于本机其他进程。**本机反向代理、SSH 转发等会让后端看到回环地址，从而直接放行**；远程账号登录应直接连接 mdnook 的 HTTPS 监听端口。转发头不会改变此规则。详细边界见 [认证说明](./docs/AUTHENTICATION.md)。

## 阅读与链接

- 切换目录会更新文件列表；目录有 `README.md` / `README.markdown` 时自动预览。
- `.md` 和 `.markdown` 扩展名不区分大小写。图片在右侧预览，支持适应窗口、原始尺寸和下载；未知格式保留下载入口。
- 图片预览支持 PNG、JPEG、GIF、WebP、AVIF、SVG、ICO、BMP，实际解码能力取决于浏览器；损坏或无法解码的图片会显示错误提示。
- TIFF、HEIC 等尚无预览器的图片会显示“不支持此图片格式”，并保留下载入口。
- 文件格式采用独立的继承树，例如 `文件 → 文本 → JSON → JSON Schema`、`XML → SVG`，同时组合文本读取、图片显示等能力。SVG 可使用图片或源码预览器。
- 工具栏“打开方式”或文件列表右键 / Shift+F10 可临时切换视图，并设置、清除文件或格式默认；“默认设置”可分别调整格式继承与能力默认。设置按文档空间保存在当前浏览器中，已有默认关联自动迁移。
- JSON 提供可展开的结构树；JSON Schema 提供属性概览和完整结构，不执行 Schema 验证或读取远程引用。Markdown 和 SVG 同时支持源码预览。
- 类型识别与预览器分别按需加载，各模块只管理直接子级；读取与解析结果在当前文件会话中复用。扩展方式和选择优先级见 [预览器说明](./docs/PREVIEWERS.md)。
- `./intro.md`、`../README.md` 和图片路径相对于**当前文档所在目录**解析。
- `/guide/start.md` 相对于 CLI 指定的根目录解析；目录链接打开目录。
- 支持 `#标题`、`doc.md#标题`、中文、空格和 URL 编码。标题锚点采用 GitHub slug 规则，重复标题追加 `-1`、`-2`。
- 浏览器前进、后退和刷新会恢复 URL 中的目录、文档及锚点。
- Ctrl / ⌘ + K 聚焦当前目录筛选框。拖动分隔线或用左右方向键调整列表宽度。
- 文档和目录通过刷新按钮重新读取；首版不监听文件变化。

本工具只读访问。访问限定在根目录，拒绝越界路径、指向根目录外的符号链接 / Windows junction；`.git`、`node_modules` 不开放浏览。Markdown 原始 HTML 不执行，SVG 附件使用独立沙箱策略；源码以纯文本显示。文本预览限 10 MiB，要求有效 UTF-8 编码且不包含 NUL 字符。Mermaid、数学公式和全文搜索尚未包含。

## 开发

轻量 pnpm workspace，前后端分别开发，安装者只需要 `mdnook` 一个 npm 包。

```text
apps/web           Vue 3 + Vite：目录浏览、分级文件预览
packages/server    Node.js + Hono：目录、文件信息、文档、附件 API
packages/shared    跨平台路径规则与 API 类型
packages/cli       mdnook：参数、启动、浏览器与退出清理
```

```bash
pnpm install
pnpm dev                   # 默认浏览 fixtures/docs
pnpm dev ./docs            # 指定开发时的文档根目录
pnpm dev ./docs --tls-cert ./cert.pem --tls-key ./key.pem  # 开发 HTTPS，允许远程登录
pnpm dev ./docs --no-auth   # 显式关闭认证，允许远程 HTTP 读取
pnpm typecheck
pnpm test
pnpm build
node packages/cli/dist/cli.js fixtures/docs --no-open
```

开发前端默认监听 `0.0.0.0:5173`。本机用 `http://127.0.0.1:5173`，其他设备用 `http://服务端IP:5173`。开发服务默认执行相同认证规则：回环 API 免登录，非回环文档 API 未登录返回 401；远程密码登录需要配置 HTTPS，此时使用 `https://服务端IP:5173`。

`/api` 直接在 Vite 收到的原始连接上执行，因此保留真实客户端 IP 和 TLS 状态。Vite 不再代理到回环后端，也不通过转发头判断身份；其文件访问范围仅开放前端源码、共享类型和依赖。独立 API 仍在 `127.0.0.1:8787` 供本机调试。开发参数支持 `--host`、`--port`、`--api-port`、`--tls-cert`、`--tls-key` 和 `--no-auth`，运行 `pnpm dev --help` 查看说明。

生产运行使用后端同时提供构建好的静态资源，资源定位相对于安装位置，与用户的工作目录独立。

## 打包验证

```bash
pnpm check
pnpm pack:cli
pnpm pack:check
```

`pnpm pack:cli` 输出 `artifacts/mdnook-0.0.3.tgz`。`pack:check` 将当前包安装到工作区内独立临时目录，仅安装生产依赖，验证命令入口、API、前端资源、深链接和退出后端口释放，然后清理临时目录。

本地安装产物：

```bash
npm install -g ./artifacts/mdnook-0.0.3.tgz
mdnook ./docs
```

仓库内部包均为私有包，通过 esbuild 合并到 CLI，前端产物复制到 `dist/public`。

## 发布到 npm

在仓库根目录执行：

```bash
npm login --auth-type=web --registry=https://registry.npmjs.org/
pnpm release:dry-run       # 构建、验证和发布预览，不上传
pnpm release:npm           # 构建、验证并正式发布
```

两个命令均执行类型检查、测试、构建与独立安装验证，再使用 npm 发布当前 `packages/cli/package.json` 版本对应的 `.tgz`。目标为官方 registry，公开包，标签为 `latest`。如 npm 要求双因素认证，按终端提示完成即可。

`pnpm release:prepare` 仅构建和验证。构建、打包及预览命令均不上传；只有 `release:npm` 执行正式发布。发布成功后可运行 `npm view mdnook@0.0.3 version --registry=https://registry.npmjs.org/` 确认；若 metadata 暂时返回 404，稍后重新查询即可。

### GitHub 标签自动发布

仓库包含 `.github/workflows/publish.yml`。推送与包版本一致的 `vX.X.X` 标签后，GitHub Actions 自动构建、测试并发布到 npm，保存安装包 artifact，再核对 registry 中的版本和 SHA-512。普通分支更新和 Pull Request 执行 CI 检查。

自动发布使用 npm Trusted Publisher（OIDC），将 `oft / mdnook / publish.yml` 配置为受信任发布者，无需仓库 Secret `NPM_TOKEN`。配置与推送步骤见 [GitHub Actions 发布说明](https://github.com/oft/mdnook/blob/main/.github/README.md)。

## API

路径参数使用相对于文档根目录的路径，URL 传输时通过 `URLSearchParams` 编码，服务端只解码一次。

| GET 接口 | 返回内容 |
| --- | --- |
| `/api/config` | 名称、版本、根目录名称和用于区分设置的匿名根目录标识 |
| `/api/entries?path=…` | 目录直接子项及文件信息 |
| `/api/file?path=…` | 文件元数据、扩展名、MIME、资源和下载地址 |
| `/api/document?path=…` | Markdown 源文本 |
| `/api/text?path=…` | 已知文本格式的 UTF-8 源文本，包括 Markdown、JSON、SVG 与常见代码格式 |
| `/api/resolve?from=…&href=…` | 链接目标类型、路径和锚点 |
| `/api/open?from=…&href=…` | 原生链接跳转，支持新标签页打开 |
| `/api/assets?path=…` | 图片或可下载附件 |
| `/api/auth/session` | 当前会话、回环放行状态和 HTTPS 登录可用性 |

`POST /api/auth/login` 接收 `{ "username": "…", "password": "…" }`；`POST /api/auth/logout` 撤销当前会话。非回环调用需要同源 `Origin`；启用认证时登录需要真实 TLS 连接。所有文档 API（包括图片、附件和下载）均执行访问检查。会话的 `mode` 分别为 `loopback`、`system` 和显式关闭认证时的 `disabled`。

错误统一为 `{ "error": { "code": "NOT_FOUND", "message": "…" } }`。

## License

MIT
