# 更新记录

## 0.0.2 — 2026-10-10

- 添加本地发布预览、安装包验证及一键 npm 发布 scripts。
- 推送 `vX.X.X` 标签后通过 GitHub Actions 自动构建并使用 npm Trusted Publisher（OIDC）发布。
- 添加 Windows / Ubuntu、Node.js 22.12 / 24 的 CI 检查矩阵。
- 校验标签版本、保存发布安装包，并核对 registry 中的版本及 SHA-512；重跑时跳过相同的已发布安装包。
- 补充发布配置说明与版本 / registry 校验测试。

## 0.0.1 — 2026-10-10

首个版本，提供本地 Markdown 目录阅读器。

- `mdnook [directory]` 启动本地 Web 服务，并自动打开浏览器。
- 目录树、当前目录文件列表与文档预览同时显示。
- 支持 Markdown 相对链接、本地图片、中文与 URL 编码路径、标题锚点和重复标题。
- 提供文件名筛选、代码高亮、任务列表、可调列表宽度、深浅主题和窄屏布局。
- 只读访问指定根目录，拒绝越界路径与指向根目录外的符号链接 / junction。
- 采用 pnpm workspace、Vue 3 + Vite 前端与独立 Node.js + Hono 后端。
- npm 包包含完整前端和 CLI 运行产物，支持独立安装使用。

最低 Node.js 版本为 22.12。本版本使用手动刷新读取文件变化；全文搜索、文件监听、Mermaid 和数学公式尚未包含。
