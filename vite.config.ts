import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import http from 'node:http'
import https from 'node:https'

/**
 * Proxy /evo/* → Evolution real (header X-Evolution-Target ou env).
 * Resolve CORS no dev/preview quando o browser chama a API.
 */
function evolutionProxyPlugin(): Plugin {
  const handler = (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: () => void,
  ) => {
    if (!req.url?.startsWith('/evo')) {
      next()
      return
    }

    const targetHeader = String(req.headers['x-evolution-target'] || '')
    const fallback =
      process.env.EVOLUTION_PROXY_TARGET || 'http://127.0.0.1:8081'
    const targetBase = (targetHeader || fallback).replace(/\/+$/, '')

    let targetUrl: URL
    try {
      // /evo/instance/... → /instance/...
      const path = (req.url.replace(/^\/evo\/?/, '/') || '/').split('?')[0] || '/'
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
      targetUrl = new URL(
        `${path}${qs}`,
        targetBase.endsWith('/') ? targetBase : `${targetBase}/`,
      )
    } catch {
      res.statusCode = 400
      res.end('Invalid Evolution target')
      return
    }

    const isHttps = targetUrl.protocol === 'https:'
    const lib = isHttps ? https : http

    const headers: http.OutgoingHttpHeaders = { ...req.headers }
    delete headers.host
    delete headers['x-evolution-target']
    // evita compressão estranha no proxy simples
    delete headers['accept-encoding']

    const proxyReq = lib.request(
      targetUrl,
      {
        method: req.method,
        headers: {
          ...headers,
          host: targetUrl.host,
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
        proxyRes.pipe(res)
      },
    )

    proxyReq.on('error', (err) => {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: true,
          message: `Proxy Evolution falhou: ${err.message}. A API está em ${targetBase}?`,
        }),
      )
    })

    req.pipe(proxyReq)
  }

  return {
    name: 'evolution-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handler(req, res, next)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        handler(req, res, next)
      })
    },
  }
}

export default defineConfig({
  /** Marca do build — a tela Ajustes mostra, pra saber se o PWA pegou a versão nova. */
  define: {
    __BUILD_ID__: JSON.stringify(
      new Date().toISOString().slice(0, 16).replace('T', ' '),
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    evolutionProxyPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Lista Zap',
        short_name: 'ListaZap',
        description: 'Listas de clientes → WhatsApp, com fila e IA',
        theme_color: '#0B0F0E',
        background_color: '#0B0F0E',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'pt-BR',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
  },
})
