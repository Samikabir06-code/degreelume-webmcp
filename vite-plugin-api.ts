import type { Plugin } from 'vite'

// Dev-only bridge: routes /api/* through the same Worker handler that serves
// production, so Canvas connect works on localhost without `wrangler dev`.
// The Worker module is plain JS (worker/index.js) and exports `handleApi`.
export function apiPlugin(): Plugin {
  return {
    name: 'degreelume:api-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next()
        try {
          const mod = await server.ssrLoadModule('/worker/index.js')
          const handleApi = mod.handleApi as (request: Request, env: Record<string, string>) => Promise<Response>
          const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v)
            else if (Array.isArray(v)) headers.set(k, v.join(', '))
          }
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const body = chunks.length ? Buffer.concat(chunks) : undefined
          const request = new Request(url, {
            method: req.method,
            headers,
            body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
          })
          const response = await handleApi(request, { ...process.env } as Record<string, string>)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          const buf = Buffer.from(await response.arrayBuffer())
          res.end(buf)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'dev_bridge_failed', detail: String(err) }))
        }
      })
    },
  }
}
