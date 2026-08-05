import type { ExtractedRow } from '@/types'
import { createId } from './id'
import { sampleExtractedRows } from './demo-data'
import { applyTemplate, localRewrite } from './message'
import { isValidBrPhone, normalizePhone } from './phone'
import {
  registerRuntimeSecret,
  sanitizeErrorMessage,
  sanitizePersonName,
  stripCpfEverywhere,
} from './security'

/**
 * H2: NÃO pedir CPF na visão. CPF fica só se o usuário digitar manualmente.
 * Imagem ainda vai ao Google se houver API key — UI deve avisar.
 */
const VISION_PROMPT = `Você extrai contatos de fotos de listas de clientes (manuscritas ou impressas) no Brasil.
Retorne APENAS JSON válido no formato:
{"rows":[{"nome":"","telefone":"","confidence":0.0,"uncertain":false}]}
Regras:
- telefone: digitos BR (DDD + número). Se tiver 55, mantenha.
- NÃO extraia CPF, RG ou documentos. Ignore colunas de documento.
- confidence 0-1; uncertain true se leitura duvidosa.
- Ignore cabeçalhos e ruído.
- NÃO invente telefones.
- No campo nome, só o nome da pessoa — sem números de documento.`

export async function extractFromImages(params: {
  apiKey: string
  model: string
  dataUrls: string[]
  forceDemo?: boolean
}): Promise<{ rows: ExtractedRow[]; source: 'gemini' | 'demo'; error?: string }> {
  if (params.forceDemo || !params.apiKey.trim() || params.dataUrls.length === 0) {
    return { rows: sampleExtractedRows(), source: 'demo' }
  }

  registerRuntimeSecret(params.apiKey)

  try {
    const parts: Array<Record<string, unknown>> = [{ text: VISION_PROMPT }]
    for (const url of params.dataUrls.slice(0, 4)) {
      const m = url.match(/^data:(.+?);base64,(.+)$/)
      if (!m) continue
      parts.push({
        inline_data: {
          mime_type: m[1],
          data: m[2],
        },
      })
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(45_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (!res.ok) {
      return {
        rows: sampleExtractedRows(),
        source: 'demo',
        error: `Gemini vision falhou (${res.status}). Usando lista demo.`,
      }
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ??
      ''
    const parsed = JSON.parse(text) as {
      rows?: Array<{
        nome?: string
        telefone?: string
        cpf?: string
        confidence?: number
        uncertain?: boolean
      }>
    }

    const rows: ExtractedRow[] = (parsed.rows ?? []).map((r) => {
      const phone = normalizePhone(r.telefone ?? '')
      return {
        id: createId('row'),
        // C1: sanitiza nome na ingestão
        nome: sanitizePersonName(r.nome ?? ''),
        telefone: phone,
        // H2: descarta CPF vindo do modelo mesmo se o modelo inventar
        cpf: '',
        confidence: typeof r.confidence === 'number' ? r.confidence : 0.5,
        uncertain:
          Boolean(r.uncertain) ||
          (r.confidence ?? 1) < 0.75 ||
          !isValidBrPhone(phone),
        selected: isValidBrPhone(phone),
      }
    })

    if (rows.length === 0) {
      return {
        rows: sampleExtractedRows(),
        source: 'demo',
        error: 'Gemini não retornou linhas. Lista demo carregada.',
      }
    }

    return { rows, source: 'gemini' }
  } catch (err) {
    const msg = sanitizeErrorMessage(
      err instanceof Error ? err.message : String(err),
      100,
    )
    return {
      rows: sampleExtractedRows(),
      source: 'demo',
      error: `Falha Gemini: ${msg}. Usando lista demo.`,
    }
  }
}

export async function rewriteMessage(params: {
  apiKey: string
  model: string
  template: string
  nome: string
  seed: number
  useGemini: boolean
  forceDemo?: boolean
}): Promise<string> {
  const safeName = sanitizePersonName(params.nome)
  const base = applyTemplate(params.template, safeName)

  if (params.forceDemo || !params.useGemini || !params.apiKey.trim()) {
    return localRewrite(base, params.seed)
  }

  registerRuntimeSecret(params.apiKey)

  try {
    const prompt = `Reescreva a mensagem de WhatsApp comercial abaixo em português do Brasil, mantendo o sentido e o tom cordial. Varie palavras e ordem. NÃO inclua CPF, RG, documentos, números de documento ou dados sensíveis. NÃO invente ofertas novas. Retorne só o texto final.

Mensagem:
${base}`

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 400 },
      }),
    })

    if (!res.ok) return localRewrite(base, params.seed)

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ??
      ''

    if (!text) return localRewrite(base, params.seed)
    return stripCpfEverywhere(text)
  } catch {
    return localRewrite(base, params.seed)
  }
}
