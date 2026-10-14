# 系统账号认证

[返回 README](../README.md)

## 访问规则

- 服务端读取 Node.js socket 的 `remoteAddress`；`127.0.0.0/8`、`::1` 和映射到 IPv4 回环地址的 IPv6 请求直接放行。
- 没有可信连接信息的请求按未登录处理。URL、Host、`X-Forwarded-For`、`X-Real-IP`、`Forwarded` 均不能触发回环放行。
- 非回环客户端需要真实 HTTPS 连接和有效会话。`X-Forwarded-Proto` 不能代替 TLS。
- 默认启用认证；只有显式 `--no-auth` 才关闭账号检查并允许远程 HTTP 读取，会话返回 `mode: disabled`，控制台和页面显示免认证模式。
- 登录页和前端构建资源公开；根目录信息、目录、正文、文件元数据、图片、下载、链接解析及跳转接口受统一检查保护。
- 原有根目录边界、系统文件 ACL、只读访问、越界和 junction 检查仍然适用。

## 账号与权限

只接受启动程序的操作系统账号。Windows 使用固定 PowerShell / C# 辅助程序调用 [LogonUserW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-logonuserw)，采用 `LOGON32_LOGON_NETWORK`，验证前后均比较账号 SID，认证 token 在使用后关闭。支持本地用户名、`计算机名\用户名`、`域\用户名` 和可解析的 UPN；域账号建议写完整账号。Windows Hello PIN 不是账号密码；空密码账号不能远程登录。

Linux / macOS 使用固定 Python 3 辅助程序调用系统 PAM 的 `login` 策略，依次执行 [pam_authenticate](https://man7.org/linux/man-pages/man3/pam_authenticate.3.html) 与 [pam_acct_mgmt](https://man7.org/linux/man-pages/man3/pam_acct_mgmt.3.html)，验证前后均确认 UID 等于有效进程 UID。过期、需要更换密码、被策略拒绝的账号不建立会话。需要 `/usr/bin/python3`、PAM 动态库和可用的 `login` 策略；不安装组件、不修改系统策略，也不要求程序提权。

文件读取直接沿用启动进程的权限。因此启动账号的提权状态和现有文件权限也会影响可读范围；这里不实现多用户权限切换。系统修改密码或禁用账号后，新登录服从系统策略，已建立的应用会话最多保留至 30 分钟到期；重启服务可立即撤销所有会话。

## 运行

```bash
# 本机：HTTP，回环免登录
mdnook ./docs

# 远程：使用客户端信任且覆盖服务 IP 的 PEM 证书
mdnook ./docs --host 0.0.0.0 --tls-cert ./cert.pem --tls-key ./key.pem --no-open

# 显式免登录共享：所有客户端都可读取指定文档目录
mdnook ./docs --host 0.0.0.0 --no-auth --no-open
```

`--host` 接受 IPv4 或 IPv6 地址；默认 `127.0.0.1`。`0.0.0.0` / `::` 表示监听所有对应接口。证书与私钥必须同时提供，启用认证时非回环监听强制 HTTPS。控制台显示监听地址；其他设备用服务端 IP 访问。Host 校验只允许当前监听 IP、本机名称/回环 IP，或在全接口监听时使用 IP 地址。

按回环免登录规则，本机反向代理或 SSH 转发的远程流量可能成为回环连接，并直接获得文档访问。需要远程登录时，应直接使用 mdnook HTTPS 端口。程序不信任任何转发头，也不支持代理身份透传。

## 开发服务

`pnpm dev [directory]` 默认监听 `0.0.0.0:5173`，默认开启认证。Vite 中间件直接使用原始 Node.js 请求和 socket 运行同一套 API，保留真实客户端地址与 TLS 状态，不再代理到本机 API。远程 HTTP 可以打开登录页，文档 API 返回 401，页面提示使用 HTTPS；回环 API 直接放行。

```bash
pnpm dev ./docs --tls-cert ./cert.pem --tls-key ./key.pem
pnpm dev ./docs --no-auth
```

第一个命令允许远程通过 HTTPS 输入启动账号密码；第二个命令显式关闭认证。可用 `--host` / `--port` 调整 Vite 监听地址和端口，`--api-port` 调整独立本机调试 API 的端口（默认 `127.0.0.1:8787`）。Vite 文件服务只开放前端源码、共享类型和依赖，阻止通过 `/@fs/` 直接读取示例文档目录；前端源码和开发资源仍为公开资源。

## 会话与请求

- 随机 256 位会话 token，仅在 cookie 中传输；服务端保存其 SHA-256 和账号名称，不保存密码。
- Cookie 使用 `__Host-` 前缀、`Secure`、`HttpOnly`、`SameSite=Strict`、`Path=/`，有效期 30 分钟。重新登录轮换，退出撤销，重启失效；每个服务实例最多保留 256 个会话。
- 账号密码仅经 HTTPS 请求与辅助进程 stdin 传递；不拼接到脚本，不通过命令行参数、环境变量、配置或日志传递。辅助进程限制输出并在 30 秒超时后结束。
- 单 IP 每分钟最多 5 次登录提交，实例每分钟最多 20 次；系统验证串行执行。系统自身的锁定策略也继续适用。
- 登录 JSON 限 8 KiB，用户名限 256 字符，密码限 1024 字符，拒绝空值和 NUL。
- 非回环登录/退出必须携带同源 Origin；跨站来源被拒绝。文档接口返回 `401 AUTH_REQUIRED` 后前端移除文档空间并显示登录页；保留原有 URL，登录后继续访问。前端每分钟及窗口聚焦时检查远程会话。

Windows 辅助组件加载与无关账号拒绝已在当前机器验证；密码成功/失败、会话和撤销的自动测试使用注入认证器。真实系统账号密码成功登录、Linux / macOS PAM 以及外部设备证书信任还需要相应环境验证。测试目录的自签名证书和私钥仅供测试，不能用于部署。
