# mdnook 0.0.1 验收记录

日期：2026-10-10。环境：Windows、Node.js 26.7.0、pnpm 10.28.1；浏览器为 Codex 内置 Chromium 页面。

## 已通过

- `pnpm typecheck`：四个包的 TypeScript / Vue 类型检查。
- `pnpm test`：9 项测试覆盖跨平台路径、中文与 URL 编码、越界拒绝、真实 Windows junction、文件类型与大小限制、附件、SPA 深链接、真实监听端口冲突及关闭。
- `pnpm dev fixtures/docs`：Vite 5173、独立 API 8787；真实页面通过代理读取文档。按 Ctrl+C 停止后两个端口均关闭。
- `pnpm pack:cli`：生产前端构建与 CLI 打包；生成 `artifacts/mdnook-0.0.1.tgz`，包中仅包含 CLI、前端资源、运行时依赖声明、说明文件及更新记录。
- `pnpm pack:check`：在独立临时目录以 npm 仅安装生产依赖、不执行安装脚本，验证版本、帮助、非法端口、不存在的目录、中文含空格的根目录、API、页面深链接、静态资源和停止后端口释放。发布产物没有私有 workspace 包的运行时依赖。

## 真实页面交互

以下为首轮实现的页面交互记录；本次版本提交重新执行类型检查、9 项自动测试、构建和独立安装包检查。

- 目录树、当前目录文件列表和 Markdown 预览同时显示，跳转后同步高亮。
- Markdown 相对链接跨目录跳转、目录 README 自动预览、中文与带空格文件。
- 含 `%` 和 `#` 的文件名只解码一次，能从 Markdown 链接正常打开。
- 重复标题生成 `下一步`、`下一步-1`；锚点点击触发阅读区滚动。
- 本地 SVG 图片实际加载，`naturalWidth = 800`。
- 缺失文档与越界链接显示错误提示，并保留当前文档。
- 文件名筛选、Ctrl+K 聚焦、键盘调整分隔线、深浅主题。
- 浏览器前进、后退、刷新恢复当前文档。
- 390 × 844 窄屏中列表和预览同时可见，页面横向宽度为 390；标题目录能作为侧面板打开。
- 最终页面与开发页面的浏览器 console 无 error / warn。

## 验证边界

最低声明版本为 Node.js 22.12；其依赖的 engines 与此匹配，但本次未在 Node.js 22 / 24、Linux 或 macOS 上运行。

默认浏览器自动打开分支已实际调用，未报告启动失败；系统浏览器不在当前浏览器工具的可观察范围内，因此未将其页面显示计入 UI 验收。生产界面通过独立 CLI 服务和内置浏览器验证。

测试运行器在 Windows 沙箱内曾遇到 `uv_os_get_passwd` 失败；CLI / Vite 曾遇到依赖文件读取 `EPERM`。这些命令经允许在沙箱外运行后通过，未修改系统配置。

本次生成了安装包，没有执行 npm publish。首版通过手动刷新读取变化；全文搜索、文件监听、Mermaid 和数学公式留待后续。

## 页面截图

![mdnook 桌面界面](./screenshots/mdnook-desktop.jpg)

## GitHub Actions 配置验证

- 新增 `ci.yml`：分支更新 / PR 的 Windows、Ubuntu 与 Node.js 22.12 / 24 检查矩阵。
- 新增 `publish.yml`：`vX.X.X` 标签触发构建、安装验证、npm 发布、registry 版本与 SHA-512 核对。
- actionlint 1.7.12：两个工作流的语法及 GitHub Actions 配置校验通过。
- 本地 `pnpm release:dry-run` 通过：类型检查、12 项测试、构建、独立 npm 安装和发布预览。其中 3 项新增测试覆盖标签版本不一致、不可发布的包、同版本产物冲突，以及 registry 的 404 / 401 / 500 区分。
- 本次没有创建新版本标签，也没有上传 npm 包。npm 凭据或 Trusted Publisher 的授权需要由维护者配置；本地预览不能验证 GitHub OIDC 和 npm 发布权限。

## 0.0.2 发布准备

- `pnpm release:tag-check v0.0.2` 通过，全部 workspace 包及运行界面版本统一为 `0.0.2`。
- 类型检查、12 项测试、生产构建、`mdnook-0.0.2.tgz` 独立安装与发布预览通过。
- 修改后的工作流通过 actionlint 校验；发布步骤通过 OIDC 获取身份，不读取 `NPM_TOKEN`。
- 此处记录本地发布前验证；实际 npm 发布及 Trusted Publisher 首次验证以 `v0.0.2` 的 GitHub Actions 发布运行结果为准。

## 0.0.2 OIDC 发布与 registry 延迟

- 发布运行：<https://github.com/oft/mdnook/actions/runs/38049446042>。npm 接受上传并签署 provenance；发布后提示需要几分钟处理，最初约 1 分钟的 metadata 检查等待不足。
- 已从公开 registry 确认 `mdnook@0.0.2`、`latest = 0.0.2`，并确认发布身份包含 GitHub Trusted Publisher。
- 下载原发布运行的 CI 安装包，确认 SHA-512 与 registry 中的安装包完全一致；对应提交的 Linux / Windows、Node 22.12 / 24 四组 CI 均通过。
- 发布后的校验等待窗口延长到 10 分钟；新增延迟可用、校验值冲突和处理超时的回归测试。重跑保存安装包时允许替换同名 artifact。
- CI 修复后的 14 项测试、脚本语法检查和 actionlint 校验均通过。
