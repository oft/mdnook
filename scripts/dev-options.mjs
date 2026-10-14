import { parseArgs } from 'node:util'
import { isIP } from 'node:net'
import { resolve } from 'node:path'

export function parseDevOptions(args, cwd, defaultRoot) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    host: { type: 'string', default: '0.0.0.0' },
    port: { type: 'string', short: 'p', default: '5173' },
    'api-port': { type: 'string', default: '8787' },
    'tls-cert': { type: 'string' },
    'tls-key': { type: 'string' },
    'no-auth': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  } })
  if (positionals.length > 1) throw new Error('只能指定一个文档目录')
  if (isIP(values.host) === 0) throw new Error('--host 必须是 IPv4 或 IPv6 地址')
  if (!!values['tls-cert'] !== !!values['tls-key']) throw new Error('--tls-cert 和 --tls-key 必须同时指定')
  const port = (value, option) => {
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error(`${option} 必须是 1–65535 的整数`)
    return Number(value)
  }
  return {
    root: resolve(cwd, positionals[0] ?? defaultRoot),
    host: values.host,
    port: port(values.port, '--port'),
    apiPort: port(values['api-port'], '--api-port'),
    authentication: values['no-auth'] ? 'disabled' : 'system',
    tlsCert: values['tls-cert'] ? resolve(cwd, values['tls-cert']) : '',
    tlsKey: values['tls-key'] ? resolve(cwd, values['tls-key']) : '',
    help: values.help,
  }
}

export function devEnvironment(options, inherited = process.env) {
  return { ...inherited,
    MDNOOK_DEV_ROOT: options.root,
    MDNOOK_DEV_HOST: options.host,
    MDNOOK_DEV_PORT: String(options.port),
    MDNOOK_DEV_API_PORT: String(options.apiPort),
    MDNOOK_DEV_AUTH: options.authentication,
    MDNOOK_DEV_TLS_CERT: options.tlsCert,
    MDNOOK_DEV_TLS_KEY: options.tlsKey,
  }
}
