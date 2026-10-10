# GitHub Actions 发布

`ci.yml` 在 `main` 分支更新及 Pull Request 时，使用 Windows / Ubuntu 和 Node.js 22.12 / 24 执行完整构建与独立安装包检查。

`publish.yml` 在推送 `vX.X.X` 标签时自动发布。步骤为：标签与 CLI 版本校验 → 固定 lockfile 安装依赖 → 类型检查 / 测试 / 构建 / 独立安装 → 保存 `.tgz` artifact → 发布 npm → 轮询 registry 并核对 SHA-512。仅发布 `mdnook`，内部 workspace 包不单独发布。

## 首次发布凭据

首次发布前，在 npm 创建具备发布权限的 granular access token，然后到 [仓库 Actions Secrets](https://github.com/oft/mdnook/settings/secrets/actions) 添加 `NPM_TOKEN`。非交互发布需要 token 具备适用的发布权限及 2FA 配置；不要把 token 写入仓库。也可以先在本机执行 `pnpm release:npm` 创建 npm 包，再按下节配置 Trusted Publisher。

参考：[npm access token 文档](https://docs.npmjs.com/creating-and-viewing-access-tokens/)。

## 后续使用 Trusted Publisher

在 npm 的 `mdnook` 包 Settings → Trusted Publisher 中选择 GitHub Actions，填写：

| 字段 | 值 |
| --- | --- |
| Organization or user | `oft` |
| Repository | `mdnook` |
| Workflow filename | `publish.yml` |
| Environment name | 留空 |
| Allowed actions | 允许 `npm publish` 直接发布 |

配置生效后可删除仓库 Secret `NPM_TOKEN`，工作流通过 OIDC 发布。工作流使用 GitHub 托管 Ubuntu runner、Node.js 24、npm 11，并开启 `id-token: write`。新建 Trusted Publisher 需按 npm 当前规则在两天内完成首次发布验证；过期后需重新配置。

参考：[npm Trusted Publisher 文档](https://docs.npmjs.com/trusted-publishers/)。

## 推送版本标签

先更新 `packages/cli/package.json` 的版本、其他 workspace 版本与 `CHANGELOG.md`，然后提交代码并推送对应标签，例如下一版：

```bash
pnpm release:dry-run
git add .
git commit -m "chore(release): prepare v0.0.2"
git push origin main
git tag -a v0.0.2 -m "mdnook v0.0.2"
git push origin v0.0.2
```

标签必须严格为 `vX.X.X`，且与 `packages/cli/package.json` 的版本一致。预发布标签和版本不一致会被拒绝；普通分支 push 不发布 npm。

`v0.0.1` 已存在且指向添加工作流之前的提交，不会补触发本工作流。首次使用当前版本可执行本地 `pnpm release:npm`；自动发布从包含工作流的新版本标签开始。

## 重跑与确认

Actions → Publish npm 可查看上传收据和安装包 artifact。若上传成功后 registry 暂时不可见，工作流会等待 metadata；可重跑同一标签的失败任务。同一版本且安装包 SHA-512 一致时跳过再次上传，不同产物则要求升级版本，不覆盖已发布版本。

也可在仓库根目录运行 `pnpm release:verify` 验证当前安装包对应的 registry 版本。`release:dry-run` 不验证发布凭据，仅预览上传内容。
