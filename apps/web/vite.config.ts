import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tsImport } from 'tsx/esm/api'

export default defineConfig(async ({ command }) => {
  const webRoot = fileURLToPath(new URL('./', import.meta.url))
  const root = process.env.MDNOOK_DEV_ROOT || fileURLToPath(new URL('../../fixtures/docs', import.meta.url))
  const cert = process.env.MDNOOK_DEV_TLS_CERT
  const key = process.env.MDNOOK_DEV_TLS_KEY
  if (!!cert !== !!key) throw new Error('--tls-cert 和 --tls-key 必须同时指定')
  const https = command === 'serve' && cert && key ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined
  const plugins = [vue()]
  if (command === 'serve') {
    // Load workspace TypeScript only for development, including on Node 22.12.
    const { documentApi } = await tsImport(new URL('./dev/api.ts', import.meta.url).href, import.meta.url) as typeof import('./dev/api.js')
    plugins.push(documentApi({ root, authentication: process.env.MDNOOK_DEV_AUTH === 'disabled' ? 'disabled' : 'system' }))
  }
  return {
    plugins,
    server: {
      host: process.env.MDNOOK_DEV_HOST || '0.0.0.0',
      port: Number(process.env.MDNOOK_DEV_PORT || 5173),
      strictPort: true,
      https,
      // Vite must not provide a second, unauthenticated route to document files.
      fs: { allow: [webRoot, fileURLToPath(new URL('../../packages/shared/src', import.meta.url)), fileURLToPath(new URL('../../node_modules', import.meta.url))] },
    },
  }
})
