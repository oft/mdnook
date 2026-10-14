import type { Plugin } from 'vite'
import { createRequestHandler } from '../../../packages/server/src/index.js'
import type { ServerOptions } from '../../../packages/server/src/index.js'

export function documentApi(options: ServerOptions): Plugin {
  return {
    name: 'mdnook-document-api',
    apply: 'serve',
    async configureServer(server) {
      const { handler } = await createRequestHandler({ ...options, host: server.config.server.host === true ? '0.0.0.0' : server.config.server.host || '0.0.0.0' })
      server.middlewares.use((request, response, next) => {
        if (!/^\/api(?:\/|\?|$)/.test(request.url ?? '')) return next()
        // The original Vite socket supplies the client address and TLS state.
        // No localhost proxy or client-provided forwarding header is involved.
        void handler(request, response).catch(next)
      })
    },
  }
}
