# mdnook

在浏览器中查看本地 Markdown 目录。左侧目录树、当前目录文件列表与文档预览同时显示，支持相对链接、本地图片、代码高亮和标题目录。

包版本：`0.0.2`。源码仓库：[oft/mdnook](https://github.com/oft/mdnook)。

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
| `--no-open` | 不自动打开浏览器 |
| `-h, --help` | 帮助 |
| `-V, --version` | 版本 |

## 阅读与链接

- 切换目录会更新文件列表；目录有 `README.md` / `README.markdown` 时自动预览。
- `.md` 和 `.markdown` 扩展名不区分大小写。其他文件可下载，图片可直接打开。
- `./intro.md`、`../README.md` 和图片路径相对于**当前文档所在目录**解析。
- `/guide/start.md` 相对于 CLI 指定的根目录解析；目录链接打开目录。
- 支持 `#标题`、`doc.md#标题`、中文、空格和 URL 编码。标题锚点采用 GitHub slug 规则，重复标题追加 `-1`、`-2`。
- 浏览器前进、后退和刷新会恢复 URL 中的目录、文档及锚点。
- Ctrl / ⌘ + K 聚焦当前目录筛选框。拖动分隔线或用左右方向键调整列表宽度。
- 文档和目录通过刷新按钮重新读取；首版不监听文件变化。

本工具只读访问。访问限定在根目录，拒绝越界路径、指向根目录外的符号链接 / Windows junction；`.git`、`node_modules` 不开放浏览。Markdown 原始 HTML 不执行，SVG 附件使用独立沙箱策略。Markdown 预览限 10 MiB；文本使用 UTF-8。Mermaid、数学公式和全文搜索尚未包含。

## 开发

轻量 pnpm workspace，前后端分别开发，安装者只需要 `mdnook` 一个 npm 包。

```text
apps/web           Vue 3 + Vite：目录浏览、Markdown 渲染
packages/server    Node.js + Hono：目录、文档、附件 API
packages/shared    跨平台路径规则与 API 类型
packages/cli       mdnook：参数、启动、浏览器与退出清理
```

```bash
pnpm install
pnpm dev                   # 默认浏览 fixtures/docs
pnpm dev ./docs            # 指定开发时的文档根目录
pnpm typecheck
pnpm test
pnpm build
node packages/cli/dist/cli.js fixtures/docs --no-open
```

开发前端为 `http://127.0.0.1:5173`，后端固定为 `8787`，Vite 代理 `/api`。前端不直接访问文件系统。生产运行使用后端同时提供构建好的静态资源，资源定位相对于安装位置，与用户的工作目录独立。

## 打包验证

```bash
pnpm check
pnpm pack:cli
pnpm pack:check
```

`pnpm pack:cli` 输出 `artifacts/mdnook-0.0.2.tgz`。`pack:check` 将当前包安装到工作区内独立临时目录，仅安装生产依赖，验证命令入口、API、前端资源、深链接和退出后端口释放，然后清理临时目录。

本地安装产物：

```bash
npm install -g ./artifacts/mdnook-0.0.2.tgz
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

`pnpm release:prepare` 仅构建和验证。构建、打包及预览命令均不上传；只有 `release:npm` 执行正式发布。发布成功后可运行 `npm view mdnook@0.0.2 version --registry=https://registry.npmjs.org/` 确认；若 metadata 暂时返回 404，稍后重新查询即可。

### GitHub 标签自动发布

仓库包含 `.github/workflows/publish.yml`。推送与包版本一致的 `vX.X.X` 标签后，GitHub Actions 自动构建、测试并发布到 npm，保存安装包 artifact，再核对 registry 中的版本和 SHA-512。普通分支更新和 Pull Request 执行 CI 检查。

自动发布使用 npm Trusted Publisher（OIDC），将 `oft / mdnook / publish.yml` 配置为受信任发布者，无需仓库 Secret `NPM_TOKEN`。配置与推送步骤见 [GitHub Actions 发布说明](https://github.com/oft/mdnook/blob/main/.github/README.md)。

## API

路径参数使用相对于文档根目录的路径，URL 传输时通过 `URLSearchParams` 编码，服务端只解码一次。

| GET 接口 | 返回内容 |
| --- | --- |
| `/api/config` | 名称、版本和根目录名称 |
| `/api/entries?path=…` | 目录直接子项及文件信息 |
| `/api/document?path=…` | Markdown 源文本 |
| `/api/resolve?from=…&href=…` | 链接目标类型、路径和锚点 |
| `/api/open?from=…&href=…` | 原生链接跳转，支持新标签页打开 |
| `/api/assets?path=…` | 图片或可下载附件 |

错误统一为 `{ "error": { "code": "NOT_FOUND", "message": "…" } }`。

## License

MIT
