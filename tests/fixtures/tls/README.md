# 测试 TLS 材料

`cert.pem` 和 `key.pem` 是专门生成的自签名测试证书与私钥，只用于 `tests/auth.test.ts` 和 `tests/dev-auth.test.ts` 的本机 HTTPS socket 回归。不代表任何部署身份，不能用于实际服务，也不要加入系统信任库。
