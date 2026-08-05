import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Proxy Evolution na Vercel (mesmo contrato do Vite /evo).
 * Header obrigatório: X-Evolution-Target = URL base da Evolution
 * Forward: apikey, Authorization, body, method
 */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h.endsWith('.local')
  ) {
    return true
  }
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 10 || a === 127) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
  }
  return false
}

function isSafeTarget(urlStr: string): { ok: boolean; reason?: string } {
  try {
    const u = new URL(urlStr)
    if (u.protocol === 'https:') return { ok: true }
    if (u.protocol === 'http:' && isPrivateOrLocalHost(u.hostname)) {
      // Em serverless Vercel, localhost da function NÃO é a Evolution do usuário
      if (
        u.hostname === 'localhost' ||
        u.hostname === '127.0.0.1' ||
        u.hostname === '::1'
      ) {
        return {
          ok: false,
          reason:
            'Na Vercel, localhost aponta pro servidor serverless — use a URL pública HTTPS da sua Evolution.',
        }
      }
      return { ok: true }
    }
    if (u.protocol === 'http:') {
      return {
        ok: false,
        reason: 'HTTP público bloqueado — use HTTPS na Evolution.',
      }
    }
    return { ok: false, reason: 'Protocolo inválido' }
  } catch {
    return { ok: false, reason: 'URL target inválida' }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight (se o browser chamar cross-origin)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  )
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, apikey, Authorization, X-Evolution-Target',
  )
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const targetHeader = String(req.headers['x-evolution-target'] || '')
  const fallback = process.env.EVOLUTION_PROXY_TARGET || ''
  const targetBase = (targetHeader || fallback).replace(/\/+$/, '')

  if (!targetBase) {
    res.status(400).json({
      error: true,
      message:
        'X-Evolution-Target ausente. Configure a URL da Evolution no app.',
    })
    return
  }

  const safety = isSafeTarget(targetBase)
  if (!safety.ok) {
    res.status(400).json({ error: true, message: safety.reason })
    return
  }

  const parts = req.query.path
  const pathSegs = Array.isArray(parts)
    ? parts
    : typeof parts === 'string'
      ? [parts]
      : []
  const joined = pathSegs.map((s) => encodeURIComponent(String(s))).join('/')
  const url = `${targetBase}/${joined}`

  const headers: Record<string, string> = {}
  const apikey = req.headers.apikey
  const auth = req.headers.authorization
  if (typeof apikey === 'string') headers.apikey = apikey
  if (typeof auth === 'string') headers.Authorization = auth
  headers['Content-Type'] =
    typeof req.headers['content-type'] === 'string'
      ? req.headers['content-type']
      : 'application/json'

  try {
    const init: RequestInit = {
      method: req.method || 'GET',
      headers,
    }

    if (req.method && !['GET', 'HEAD'].includes(req.method)) {
      if (typeof req.body === 'string') {
        init.body = req.body
      } else if (req.body != null) {
        init.body = JSON.stringify(req.body)
      }
    }

    const upstream = await fetch(url, init)
    const text = await upstream.text()
    const ct = upstream.headers.get('content-type') || 'application/json'
    res.status(upstream.status)
    res.setHeader('Content-Type', ct)
    res.send(text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(502).json({
      error: true,
      message: `Proxy Evolution falhou: ${msg}. A API está em ${targetBase}?`,
    })
  }
}
