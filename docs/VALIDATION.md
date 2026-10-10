# mdnook 0.1.0 验收记录

日期：2026-10-10。环境：Windows、Node.js 26.7.0、pnpm 10.28.1；浏览器为 Codex 内置 Chromium 页面。

## 已通过

- `pnpm typecheck`：四个包的 TypeScript / Vue 类型检查。
- `pnpm test`：9 项测试覆盖跨平台路径、中文与 URL 编码、越界拒绝、真实 Windows junction、文件类型与大小限制、附件、SPA 深链接、真实监听端口冲突及关闭。
- `pnpm dev fixtures/docs`：Vite 5173、独立 API 8787；真实页面通过代理读取文档。按 Ctrl+C 停止后两个端口均关闭。
- `pnpm pack:cli`：生产前端构建与 CLI 打包；生成 `artifacts/mdnook-0.1.0.tgz`，包中仅包含 CLI、前端资源、运行时依赖声明及说明文件。
- `pnpm pack:check`：在独立临时目录以 npm 仅安装生产依赖、不执行安装脚本，验证版本、帮助、非法端口、不存在的目录、中文含空格的根目录、API、页面深链接、静态资源和停止后端口释放。发布产物没有私有 workspace 包的运行时依赖。

## 真实页面交互

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
