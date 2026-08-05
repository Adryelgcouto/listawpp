import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: true, message: 'Method not allowed' })
      return
    }

    const expected = String(process.env.LISTA_ZAP_WA_SECRET || '').trim()
    if (expected) {
      const header = String(req.headers['x-lista-zap-secret'] || '').trim()
      const auth = String(req.headers.authorization || '').trim()
      const bearer = auth.toLowerCase().startsWith('bearer ')
        ? auth.slice(7).trim()
        : ''
      if (header !== expected && bearer !== expected) {
        res.status(401).json({
          error: true,
          message: 'Não autorizado (LISTA_ZAP_WA_SECRET).',
        })
        return
      }
    }

    const url = String(process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '')
    const key = String(process.env.EVOLUTION_API_KEY || '')
    const instance = String(process.env.EVOLUTION_INSTANCE || 'lista-zap')

    if (!url || !key) {
      res.status(503).json({
        error: true,
        message: 'Evolution ainda não configurada no servidor (env).',
      })
      return
    }

    const r = await fetch(
      `${url}/instance/connectionState/${encodeURIComponent(instance)}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    )
    const text = await r.text()
    let state = 'unknown'
    try {
      const d = JSON.parse(text) as Record<string, unknown>
      const inst = d.instance as Record<string, unknown> | undefined
      state = String(inst?.state ?? d.state ?? d.status ?? 'unknown').toLowerCase()
    } catch {
      /* ignore */
    }

    res.status(200).json({
      ok: r.ok,
      status: state,
      instance,
      configured: true,
      httpStatus: r.status,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao consultar status'
    res.status(502).json({ error: true, message })
  }
}
