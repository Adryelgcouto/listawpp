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

/** Modelos estáveis pra OCR/rewrite — fallback se a listagem da API falhar. */
export const GEMINI_MODEL_FALLBACKS: Array<{ id: string; label: string }> = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (recomendado)' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite (rápido)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
]

export type GeminiModelOption = { id: string; label: string }

/**
 * Lista modelos com generateContent na conta da API key.
 * Preferência: flash/pro recentes. Em falha devolve fallbacks.
 */
export async function listGeminiModels(
  apiKey: string,
): Promise<{ models: GeminiModelOption[]; error?: string; source: 'api' | 'fallback' }> {
  if (!apiKey.trim()) {
    return { models: GEMINI_MODEL_FALLBACKS, source: 'fallback' }
  }
  registerRuntimeSecret(apiKey)
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}&pageSize=100`
    const res = await fetch(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const hint =
        res.status === 400 || res.status === 403
          ? 'API key inválida ou sem permissão'
          : `HTTP ${res.status}`
      return {
        models: GEMINI_MODEL_FALLBACKS,
        source: 'fallback',
        error: `Não listei modelos (${hint}). Usando lista padrão.`,
      }
    }
    const data = (await res.json()) as {
      models?: Array<{
        name?: string
        displayName?: string
        supportedGenerationMethods?: string[]
      }>
    }
    const models: GeminiModelOption[] = (data.models ?? [])
      .filter((m) =>
        (m.supportedGenerationMethods ?? []).includes('generateContent'),
      )
      .map((m) => {
        const raw = (m.name ?? '').replace(/^models\//, '')
        return {
          id: raw,
          label: m.displayName ? `${m.displayName} (${raw})` : raw,
        }
      })
      .filter((m) => m.id.length > 0)
      // flash/pro primeiro; evita embedding/tts
      .filter(
        (m) =>
          /gemini/i.test(m.id) &&
          !/embed|aqa|tts|image-generation|robotics/i.test(m.id),
      )
      .sort((a, b) => {
        const score = (id: string) => {
          if (id.includes('2.5-flash')) return 0
          if (id.includes('2.0-flash') && !id.includes('lite')) return 1
          if (id.includes('2.0-flash-lite')) return 2
          if (id.includes('2.5-pro')) return 3
          if (id.includes('flash')) return 4
          if (id.includes('pro')) return 5
          return 9
        }
        return score(a.id) - score(b.id) || a.id.localeCompare(b.id)
      })

    if (models.length === 0) {
      return {
        models: GEMINI_MODEL_FALLBACKS,
        source: 'fallback',
        error: 'API não retornou modelos de texto. Usando lista padrão.',
      }
    }
    return { models, source: 'api' }
  } catch (err) {
    return {
      models: GEMINI_MODEL_FALLBACKS,
      source: 'fallback',
      error: sanitizeErrorMessage(
        err instanceof Error ? err.message : 'Falha ao listar modelos',
        80,
      ),
    }
  }
}

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
