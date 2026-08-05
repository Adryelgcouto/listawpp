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
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (recomendado)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.0-flash-001', label: 'Gemini 2.0 Flash 001' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { id: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash latest' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
]

/** Ordem de tentativa quando a API responde 404 (modelo indisponível na conta). */
export const GEMINI_MODEL_RETRY_ORDER = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
] as const

/**
 * Prompt de rewrite WhatsApp — conciso, assertivo, preserva identidade da frase.
 * Exportado para auditoria/testes.
 */
export function buildRewritePrompt(message: string): string {
  return `Você é copywriter sênior de WhatsApp comercial no Brasil.

TAREFA: reescreva a MENSAGEM BASE em 1 variação curta, pronta para enviar.

IDENTIDADE (inegociável):
- Preserve a mesma oferta, o mesmo pedido e o mesmo objetivo.
- NÃO mude o produto, preço, condição, prazo ou proposta.
- NÃO invente benefícios, descontos, urgência falsa ou dados novos.
- Mantenha o nome da pessoa exatamente como está (se houver).
- Se a base for formal ou informal, mantenha o mesmo registro.

ESTILO:
- Português do Brasil, natural, humano, WhatsApp — não e-mail corporativo.
- Conciso: ideal 1–2 frases curtas (máx. ~280 caracteres).
- Assertivo e confiante, sem ser agressivo ou spam.
- Bonito: ritmo limpo, sem enrolação, sem “tudo bem? espero que sim…”.
- Variação leve de palavras/ordem — não clone palavra por palavra, mas a alma fica.

PROIBIDO:
- CPF, RG, documentos, números de documento, dados sensíveis.
- Emojis em excesso (0–1 no máximo, só se a base já usar).
- Hashtags, links inventados, assinaturas, aspas envolvendo o texto.
- Explicações, markdown, prefixos tipo "Aqui está:".

SAÍDA: somente o texto final da mensagem, nada mais.

MENSAGEM BASE:
${message}`
}

function modelCandidates(preferred: string): string[] {
  const p = preferred.trim().replace(/^models\//, '')
  const list = [p, ...GEMINI_MODEL_RETRY_ORDER.filter((m) => m !== p)]
  return [...new Set(list.filter(Boolean))]
}

async function geminiGenerate(params: {
  apiKey: string
  model: string
  parts: Array<Record<string, unknown>>
  generationConfig: Record<string, unknown>
  timeoutMs: number
}): Promise<{ ok: true; text: string; model: string } | { ok: false; status: number; message: string }> {
  const models = modelCandidates(params.model)
  let lastStatus = 0
  let lastMsg = ''

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(params.timeoutMs),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: params.parts }],
          generationConfig: params.generationConfig,
        }),
      })
      if (res.status === 404) {
        lastStatus = 404
        lastMsg = `Modelo ${model} não encontrado (404)`
        continue
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        let hint = `HTTP ${res.status}`
        try {
          const j = JSON.parse(body) as { error?: { message?: string } }
          if (j.error?.message) hint = j.error.message.slice(0, 160)
        } catch {
          if (body) hint = body.replace(/\s+/g, ' ').slice(0, 120)
        }
        lastStatus = res.status
        lastMsg = hint
        // 400/403 de key não adianta trocar modelo
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          return { ok: false, status: res.status, message: hint }
        }
        continue
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? '')
          .join('')
          .trim() ?? ''
      if (!text) {
        lastStatus = res.status
        lastMsg = 'Resposta vazia do modelo'
        continue
      }
      return { ok: true, text, model }
    } catch (err) {
      lastStatus = 0
      lastMsg = err instanceof Error ? err.message : String(err)
    }
  }
  return {
    ok: false,
    status: lastStatus || 404,
    message: lastMsg || 'Nenhum modelo Gemini respondeu',
  }
}

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
      // REST v1beta aceita snake_case; camelCase também em clients oficiais
      parts.push({
        inline_data: {
          mime_type: m[1],
          data: m[2],
        },
      })
    }

    if (parts.length < 2) {
      return {
        rows: sampleExtractedRows(),
        source: 'demo',
        error: 'Imagem inválida. Usando lista demo.',
      }
    }

    const gen = await geminiGenerate({
      apiKey: params.apiKey,
      model: params.model,
      parts,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        maxOutputTokens: 2048,
      },
      timeoutMs: 45_000,
    })

    if (!gen.ok) {
      return {
        rows: sampleExtractedRows(),
        source: 'demo',
        error: `Gemini vision falhou (${gen.status}: ${sanitizeErrorMessage(gen.message, 100)}). Use Excel/CSV ou lista demo.`,
      }
    }

    let parsed: {
      rows?: Array<{
        nome?: string
        telefone?: string
        cpf?: string
        confidence?: number
        uncertain?: boolean
      }>
    }
    try {
      // remove fences se o modelo ignorar responseMimeType
      const cleaned = gen.text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
      parsed = JSON.parse(cleaned) as typeof parsed
    } catch {
      return {
        rows: sampleExtractedRows(),
        source: 'demo',
        error: 'Gemini não devolveu JSON válido. Use Excel/CSV ou lista demo.',
      }
    }

    const rows: ExtractedRow[] = (parsed.rows ?? []).map((r) => {
      const phone = normalizePhone(r.telefone ?? '')
      return {
        id: createId('row'),
        nome: sanitizePersonName(r.nome ?? ''),
        telefone: phone,
        // H2: descarta CPF do modelo
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
        error: 'Gemini não retornou linhas. Use Excel/CSV ou lista demo.',
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
      error: `Falha Gemini: ${msg}. Use Excel/CSV ou lista demo.`,
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
    const gen = await geminiGenerate({
      apiKey: params.apiKey,
      model: params.model,
      parts: [{ text: buildRewritePrompt(base) }],
      generationConfig: {
        // baixa criatividade: preserva identidade; ainda varia o suficiente
        temperature: 0.55,
        maxOutputTokens: 220,
        topP: 0.9,
      },
      timeoutMs: 20_000,
    })

    if (!gen.ok || !gen.text) return localRewrite(base, params.seed)

    let text = stripCpfEverywhere(gen.text)
      .replace(/^["“']+|["”']+$/g, '')
      .replace(/^(aqui est[aá]|mensagem|texto)\s*[:\-–]\s*/i, '')
      .trim()

    // hard cap: concisão (WhatsApp comercial)
    if (text.length > 320) {
      text = `${text.slice(0, 317).trim()}…`
    }
    if (!text) return localRewrite(base, params.seed)
    return text
  } catch {
    return localRewrite(base, params.seed)
  }
}
