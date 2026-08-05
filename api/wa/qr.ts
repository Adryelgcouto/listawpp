import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assertWaAuth } from '../_wa-auth'

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
  if (!assertWaAuth(req, res)) return
  const { url, key, instance } = cfg()
  if (!url || !key) {
    res.status(503).json({ error: true, message: 'Evolution não configurada no servidor' })
    return
  }

  try {
    // 1) Status primeiro — NUNCA chamar /connect se já está open (derruba Baileys)
    const st = await fetch(
      `${url}/instance/connectionState/${encodeURIComponent(instance)}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    )
    if (st.ok) {
      const stText = await st.text()
      try {
        const d = JSON.parse(stText) as Record<string, unknown>
        const inst = d.instance as Record<string, unknown> | undefined
        const state = String(
          inst?.state ?? d.state ?? d.status ?? '',
        ).toLowerCase()
        if (state === 'open' || state === 'connected') {
          res.status(200).json({
            ok: true,
            status: 'open',
            qr: null,
            pairingCode: null,
            instance,
            message: 'Já conectado — não regenera QR',
          })
          return
        }
      } catch {
        /* segue pro connect */
      }
    }

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

    // 2) Só agora pede QR (connect). Cliente deve chamar isso com throttle.
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
