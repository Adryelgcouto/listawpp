import type { VercelRequest, VercelResponse } from '@vercel/node'

function cfg() {
  const url = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '')
  const key = process.env.EVOLUTION_API_KEY || ''
  const instance = process.env.EVOLUTION_INSTANCE || 'lista-zap'
  return { url, key, instance }
}

function pickQr(data: Record<string, unknown>): string | null {
  const raw =
    data.base64 ??
    (data.qrcode as Record<string, unknown> | undefined)?.base64 ??
    data.qr
  if (typeof raw !== 'string' || !raw) return null
  if (raw.startsWith('data:image')) return raw
  return `data:image/png;base64,${raw.replace(/\s/g, '')}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { url, key, instance } = cfg()
  if (!url || !key) {
    res.status(503).json({ error: true, message: 'Evolution não configurada no servidor' })
    return
  }

  try {
    // ensure instance
    const st = await fetch(
      `${url}/instance/connectionState/${encodeURIComponent(instance)}`,
      { headers: { apikey: key } },
    )
    if (st.status === 404) {
      await fetch(`${url}/instance/create`, {
        method: 'POST',
        headers: {
          apikey: key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceName: instance,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
        }),
      })
    }

    const r = await fetch(
      `${url}/instance/connect/${encodeURIComponent(instance)}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    )
    const text = await r.text()
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      res.status(502).json({ error: true, message: 'Resposta inválida da Evolution' })
      return
    }
    const qr = pickQr(data)
    const pairing =
      typeof data.pairingCode === 'string' ? data.pairingCode : null

    if (!qr && !pairing) {
      res.status(200).json({
        ok: false,
        message: 'Sem QR no momento — tente de novo em alguns segundos',
        instance,
      })
      return
    }

    res.status(200).json({
      ok: true,
      qr,
      pairingCode: pairing,
      instance,
    })
  } catch (e) {
    res.status(502).json({
      error: true,
      message: e instanceof Error ? e.message : 'Falha ao obter QR',
    })
  }
}
