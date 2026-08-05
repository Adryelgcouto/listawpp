import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assertWaAuth } from '../_wa-auth'

function cfg() {
  const url = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '')
  const key = process.env.EVOLUTION_API_KEY || ''
  const instance = process.env.EVOLUTION_INSTANCE || 'lista-zap'
  return { url, key, instance }
}

/** Remove CPF de texto antes de enviar */
function stripCpf(text: string): string {
  return text
    .replace(/(?:\d[\d.\-\s/]*){10}\d/g, (m) => {
      const d = m.replace(/\D/g, '')
      return d.length >= 11 ? '[cpf-removido]' : m
    })
    .replace(/\d{11}/g, '[cpf-removido]')
}

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!assertWaAuth(req, res)) return
  const { url, key, instance } = cfg()
  if (!url || !key) {
    res.status(503).json({ error: true, message: 'Evolution não configurada' })
    return
  }

  const body = req.body as {
    number?: string
    text?: string
    mediaDataUrl?: string
    caption?: string
  }
  const number = String(body.number || '').replace(/\D/g, '')
  if (number.length < 12) {
    res.status(400).json({ error: true, message: 'Número inválido' })
    return
  }

  try {
    if (body.mediaDataUrl) {
      const match = body.mediaDataUrl.match(/^data:(.+?);base64,(.+)$/)
      if (!match) {
        res.status(400).json({ error: true, message: 'Imagem inválida' })
        return
      }
      const caption = stripCpf(String(body.caption || body.text || ''))
      const r = await fetch(
        `${url}/message/sendMedia/${encodeURIComponent(instance)}`,
        {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number,
            mediatype: 'image',
            mimetype: match[1],
            caption,
            media: match[2],
            fileName: 'oferta.jpg',
          }),
        },
      )
      if (!r.ok) {
        res.status(r.status).json({
          error: true,
          message: `Envio mídia falhou (${r.status})`,
        })
        return
      }
      res.status(200).json({ ok: true })
      return
    }

    const text = stripCpf(String(body.text || ''))
    if (!text) {
      res.status(400).json({ error: true, message: 'Texto vazio' })
      return
    }
    const r = await fetch(
      `${url}/message/sendText/${encodeURIComponent(instance)}`,
      {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number, text }),
      },
    )
    if (!r.ok) {
      res.status(r.status).json({
        error: true,
        message: `Envio texto falhou (${r.status})`,
      })
      return
    }
    res.status(200).json({ ok: true })
  } catch (e) {
    res.status(502).json({
      error: true,
      message: e instanceof Error ? e.message : 'Falha no envio',
    })
  }
}
