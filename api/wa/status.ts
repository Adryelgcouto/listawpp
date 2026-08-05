import type { VercelRequest, VercelResponse } from '@vercel/node'

function cfg() {
  const url = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '')
  const key = process.env.EVOLUTION_API_KEY || ''
  const instance = process.env.EVOLUTION_INSTANCE || 'lista-zap'
  return { url, key, instance }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { url, key, instance } = cfg()
  if (!url || !key) {
    res.status(503).json({
      error: true,
      message: 'Evolution ainda não configurada no servidor (env).',
    })
    return
  }
  try {
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
    })
  } catch (e) {
    res.status(502).json({
      error: true,
      message: e instanceof Error ? e.message : 'Falha ao consultar status',
    })
  }
}
