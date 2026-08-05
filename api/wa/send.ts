import type { VercelRequest, VercelResponse } from '@vercel/node'

/** 11 dígitos que não são todos iguais — mesma regra tolerante do cliente. */
function looksLikeCpfWindow(digits: string): boolean {
  for (let i = 0; i <= digits.length - 11; i++) {
    const w = digits.slice(i, i + 11)
    if (!/^(\d)\1{10}$/.test(w)) return true
  }
  return false
}

/**
 * Rede de segurança server-side.
 * Não atravessa quebra de linha (`\n` fora da classe) e protege telefones 55…,
 * senão uma mensagem de várias linhas com números vira "[cpf-removido]".
 */
function stripCpf(text: string): string {
  const phones: string[] = []
  let out = text.replace(/55\d{10,11}/g, (m) => {
    phones.push(m)
    return `__PHONE_${phones.length - 1}__`
  })

  out = out.replace(/(?:\d[\d.\-/ \t]*){10}\d/g, (m) => {
    const d = m.replace(/\D/g, '')
    return d.length >= 11 && looksLikeCpfWindow(d) ? '[cpf-removido]' : m
  })
  out = out.replace(/\d{11}/g, (m) =>
    looksLikeCpfWindow(m) ? '[cpf-removido]' : m,
  )

  return out.replace(/__PHONE_(\d+)__/g, (_, i) => phones[Number(i)] ?? '')
}

/** WhatsApp só entende \n — CRLF vira quebra literal estranha em alguns clients. */
function normalizeOutbound(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
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
      res.status(503).json({ error: true, message: 'Evolution não configurada' })
      return
    }

    const body = (req.body || {}) as {
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

    if (body.mediaDataUrl) {
      const match = String(body.mediaDataUrl).match(/^data:(.+?);base64,(.+)$/)
      if (!match) {
        res.status(400).json({ error: true, message: 'Imagem inválida' })
        return
      }
      const caption = normalizeOutbound(
        stripCpf(String(body.caption || body.text || '')),
      )
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

    const text = normalizeOutbound(stripCpf(String(body.text || '')))
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
