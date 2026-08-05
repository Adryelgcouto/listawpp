import type { WaConnectionStatus } from '@/types'
import {
  isSafeEvolutionUrl,
  registerRuntimeSecret,
  sanitizeErrorMessage,
} from './security'

export class EvolutionError extends Error {
  status?: number
  kind: 'cors' | 'network' | 'http' | 'parse' | 'config'

  constructor(
    message: string,
    opts?: { status?: number; kind?: EvolutionError['kind'] },
  ) {
    super(sanitizeErrorMessage(message, 220))
    this.name = 'EvolutionError'
    this.status = opts?.status
    this.kind = opts?.kind ?? 'http'
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Resolve URL de chamada.
 * No browser (dev/preview com Vite), SEMPRE usa proxy `/evo` + header
 * X-Evolution-Target — elimina CORS pra qualquer host Evolution.
 * Fora do browser (testes Node), chama a URL direta.
 */
export function resolveEvolutionFetchBase(configuredUrl: string): {
  base: string
  viaProxy: boolean
  target: string
} {
  const target = stripTrailingSlash(configuredUrl.trim())
  if (typeof window !== 'undefined') {
    return { base: '/evo', viaProxy: true, target }
  }
  return { base: target, viaProxy: false, target }
}

function authHeaders(apiKey: string): HeadersInit {
  registerRuntimeSecret(apiKey)
  return {
    'Content-Type': 'application/json',
    apikey: apiKey,
    // Algumas instalações aceitam Bearer
    Authorization: `Bearer ${apiKey}`,
  }
}

/** Extrai mensagem útil do body sem vazar secrets longos. */
function hintFromBody(body: string, status: number): string {
  const raw = (body || '').replace(/\s+/g, ' ').trim().slice(0, 160)
  if (!raw) return `Evolution HTTP ${status}`
  // tenta JSON { message, error, response.message }
  try {
    const j = JSON.parse(body) as Record<string, unknown>
    const msg =
      (typeof j.message === 'string' && j.message) ||
      (typeof j.error === 'string' && j.error) ||
      (typeof (j.response as Record<string, unknown> | undefined)?.message ===
        'string' &&
        String((j.response as Record<string, unknown>).message)) ||
      ''
    if (msg) return `HTTP ${status}: ${msg.slice(0, 140)}`
  } catch {
    /* not json */
  }
  return `HTTP ${status}: ${raw.slice(0, 120)}`
}

async function evoFetch(
  configuredUrl: string,
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (!configuredUrl.trim() || !apiKey.trim()) {
    throw new EvolutionError(
      'Configure URL, API key e instância da Evolution em Ajustes.',
      { kind: 'config' },
    )
  }

  const safety = isSafeEvolutionUrl(configuredUrl)
  if (!safety.ok) {
    throw new EvolutionError(safety.reason ?? 'URL Evolution insegura', {
      kind: 'config',
    })
  }

  const { base, viaProxy, target } = resolveEvolutionFetchBase(configuredUrl)
  const p = path.startsWith('/') ? path : `/${path}`
  const full = `${base}${p}`

  try {
    const res = await fetch(full, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(20_000),
      headers: {
        ...authHeaders(apiKey),
        // proxy Vite usa este header pra saber o destino real
        ...(viaProxy ? { 'X-Evolution-Target': target } : {}),
        ...(init?.headers ?? {}),
      },
    })
    return res
  } catch (err) {
    if (err instanceof EvolutionError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(msg)) {
      throw new EvolutionError(
        viaProxy
          ? 'Falha ao falar com Evolution via proxy. A API está rodando? (ex.: porta 8081)'
          : 'Falha de rede/CORS. Na Evolution libere CORS pra origem deste app, ou use HTTPS + CORS_ORIGIN=*.',
        { kind: 'cors' },
      )
    }
    if (/abort|timeout/i.test(msg)) {
      throw new EvolutionError('Timeout ao falar com a Evolution (20s).', {
        kind: 'network',
      })
    }
    throw new EvolutionError(`Erro de rede: ${msg}`, { kind: 'network' })
  }
}

export function normalizeQrDataUrl(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (!s) return null
  if (s.startsWith('data:image')) return s
  // alguns servers devolvem "data:image/png;base64,XXXX" com espaços
  s = s.replace(/\s/g, '')
  if (s.startsWith('data:image')) return s
  if (s.startsWith('base64,')) return `data:image/png;${s}`
  // bare base64
  if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length > 80) {
    return `data:image/png;base64,${s}`
  }
  return null
}

function pickQrFromPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const nested = [
    o.base64,
    o.qrcode,
    o.qr,
    o.code,
    o.pairingCode,
    (o.qrcode as Record<string, unknown> | undefined)?.base64,
    (o.qrcode as Record<string, unknown> | undefined)?.code,
    (o.instance as Record<string, unknown> | undefined)?.qrcode,
    (o.instance as Record<string, unknown> | undefined)?.base64,
    (o.data as Record<string, unknown> | undefined)?.base64,
    (o.data as Record<string, unknown> | undefined)?.qrcode,
    (o.data as Record<string, unknown> | undefined)?.code,
  ]
  for (const c of nested) {
    const n = normalizeQrDataUrl(c)
    if (n) return n
  }
  return null
}

/**
 * Cria instância na Evolution já hospedada (mesma do VSB).
 * Idempotente: se já existe (403/409), trata como ok.
 * Sem webhook — Lista Zap envia direto e lê status/QR.
 */
export async function createInstance(params: {
  url: string
  apiKey: string
  instance: string
}): Promise<{ ok: boolean; alreadyExisted?: boolean; error?: string }> {
  const name = params.instance.trim()
  if (!name) return { ok: false, error: 'Nome da instância vazio' }

  try {
    const res = await evoFetch(params.url, params.apiKey, '/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName: name,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
      }),
    })

    if (res.ok) return { ok: true }

    const text = await res.text().catch(() => '')
    // já existe
    if (res.status === 403 || res.status === 409) {
      return { ok: true, alreadyExisted: true }
    }
    // alguns retornam 400 com "already"
    if (/already|exist|já exist/i.test(text)) {
      return { ok: true, alreadyExisted: true }
    }
    return {
      ok: false,
      error: sanitizeErrorMessage(hintFromBody(text, res.status)),
    }
  } catch (err) {
    const e = err as EvolutionError
    return {
      ok: false,
      error: sanitizeErrorMessage(e.message || 'Falha ao criar instância'),
    }
  }
}

/** Garante que a instância existe; se não, cria. */
export async function ensureInstance(params: {
  url: string
  apiKey: string
  instance: string
}): Promise<{ ok: boolean; error?: string }> {
  const state = await getConnectionState(
    params.url,
    params.apiKey,
    params.instance,
  )
  // se respondeu open/close/connecting/unknown, a instância existe
  if (state.status !== 'error') {
    return { ok: true }
  }
  // 404 / not found → cria
  if (
    state.error &&
    /404|não encontrada|not found|instância/i.test(state.error)
  ) {
    const created = await createInstance(params)
    if (!created.ok) return { ok: false, error: created.error }
    return { ok: true }
  }
  // erro de auth/rede — não tenta create
  if (
    state.error &&
    /401|403|chave|API key|CORS|rede|Timeout|indispon/i.test(state.error)
  ) {
    return { ok: false, error: state.error }
  }
  // tenta create de qualquer forma (instância pode não existir)
  const created = await createInstance(params)
  if (created.ok) return { ok: true }
  return { ok: false, error: created.error || state.error }
}

export async function getConnectionState(
  url: string,
  apiKey: string,
  instance: string,
): Promise<{ status: WaConnectionStatus; error?: string }> {
  if (!instance.trim()) {
    return { status: 'error', error: 'Nome da instância vazio' }
  }
  try {
    const res = await evoFetch(
      url,
      apiKey,
      `/instance/connectionState/${encodeURIComponent(instance)}`,
      { method: 'GET' },
    )
    if (res.status === 404) {
      return {
        status: 'error',
        error:
          'Instância não encontrada (404). Use o NOME da instância (não o ID), ex.: lista-zap',
      }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        status: 'error',
        error: sanitizeErrorMessage(hintFromBody(text, res.status)),
      }
    }
    const data = (await res.json()) as Record<string, unknown>
    const state =
      (data?.instance as Record<string, unknown> | undefined)?.state ??
      (data?.instance as Record<string, unknown> | undefined)?.connectionStatus ??
      data?.state ??
      data?.status ??
      data?.connectionStatus ??
      (data?.data as Record<string, unknown> | undefined)?.state

    const s = String(state ?? 'unknown').toLowerCase()
    if (s === 'open' || s === 'connected') return { status: 'open' }
    if (
      s === 'connecting' ||
      s === 'qr' ||
      s === 'pair' ||
      s === 'pairing' ||
      s === 'refused'
    )
      return { status: 'connecting' }
    if (
      s === 'close' ||
      s === 'closed' ||
      s === 'disconnected' ||
      s === 'logout'
    )
      return { status: 'close' }
    return { status: 'unknown' }
  } catch (err) {
    const e = err as EvolutionError
    return {
      status: 'error',
      error: sanitizeErrorMessage(e.message || 'Falha ao consultar status'),
    }
  }
}

function pickPairingCode(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const candidates = [
    o.pairingCode,
    o.code,
    (o.instance as Record<string, unknown> | undefined)?.pairingCode,
    (o.data as Record<string, unknown> | undefined)?.pairingCode,
    (o.qrcode as Record<string, unknown> | undefined)?.pairingCode,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length >= 4 && c.length <= 16) {
      // pairing code costuma ser curto alfanumérico (não base64 longo)
      if (!/^[A-Za-z0-9+/=]{80,}$/.test(c.replace(/\s/g, ''))) {
        return c.trim().toUpperCase()
      }
    }
  }
  return null
}

export async function fetchQrCode(
  url: string,
  apiKey: string,
  instance: string,
): Promise<{
  qr: string | null
  pairingCode?: string | null
  error?: string
  alreadyOpen?: boolean
}> {
  // NUNCA chamar /connect se já open — Baileys derruba a sessão
  const current = await getConnectionState(url, apiKey, instance)
  if (current.status === 'open') {
    return {
      qr: null,
      alreadyOpen: true,
      error: 'WhatsApp já está conectado',
    }
  }

  // v1/v2: connect gera/atualiza QR; alguns usam qrcode
  const paths = [
    `/instance/connect/${encodeURIComponent(instance)}`,
    `/instance/qrcode/${encodeURIComponent(instance)}`,
    `/instance/qrCode/${encodeURIComponent(instance)}`,
  ]

  let lastError = ''
  let lastPairing: string | null = null
  for (const path of paths) {
    try {
      const res = await evoFetch(url, apiKey, path, { method: 'GET' })
      if (res.status === 404) {
        lastError = `Endpoint ${path} não existe (404)`
        continue
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        lastError = hintFromBody(text, res.status)
        continue
      }
      const data = await res.json().catch(() => null)
      const qr = pickQrFromPayload(data)
      const pairing = pickPairingCode(data)
      if (pairing) lastPairing = pairing
      if (qr) return { qr, pairingCode: pairing }
      // às vezes connect devolve count sem base64 se já conectado
      const state = pickState(data)
      if (state === 'open' || state === 'connected') {
        return { qr: null, alreadyOpen: true, error: 'WhatsApp já está conectado' }
      }
      if (pairing) {
        return { qr: null, pairingCode: pairing }
      }
      lastError = `Resposta sem QR em ${path}`
    } catch (err) {
      const e = err as EvolutionError
      lastError = e.message
      if (e.kind === 'cors' || e.kind === 'network' || e.kind === 'config') {
        return { qr: null, error: lastError }
      }
    }
  }
  return {
    qr: null,
    pairingCode: lastPairing,
    error: sanitizeErrorMessage(
      lastError ||
        'Não foi possível obter o QR. Confira se a Evolution está ligada e a chave está correta.',
    ),
  }
}

function pickState(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const o = data as Record<string, unknown>
  const s =
    (o.instance as Record<string, unknown> | undefined)?.state ??
    o.state ??
    o.status
  return String(s ?? '').toLowerCase()
}

/** Normaliza número pro formato Evolution (só dígitos, com 55). */
export function toEvolutionNumber(phone: string): string {
  return phone.replace(/\D/g, '')
}

export async function sendText(params: {
  url: string
  apiKey: string
  instance: string
  number: string
  text: string
}): Promise<void> {
  const number = toEvolutionNumber(params.number)
  if (number.length < 12) {
    throw new EvolutionError('Número inválido para envio', { kind: 'config' })
  }

  // Formato v2 padrão (doc oficial): { number, text }
  const payloads: unknown[] = [
    { number, text: params.text },
    // fallback instalações antigas
    { number, textMessage: { text: params.text } },
    { number, options: { delay: 0, presence: 'composing' }, text: params.text },
  ]

  let lastStatus = 0
  let lastBody = ''
  for (const body of payloads) {
    const res = await evoFetch(
      params.url,
      params.apiKey,
      `/message/sendText/${encodeURIComponent(params.instance)}`,
      { method: 'POST', body: JSON.stringify(body) },
    )
    if (res.ok) return
    lastStatus = res.status
    lastBody = await res.text().catch(() => '')
    // 404/400 de formato: tenta próximo payload; 401/403 para
    if (res.status === 401 || res.status === 403) break
  }

  throw new EvolutionError(hintFromBody(lastBody, lastStatus || 0), {
    status: lastStatus,
    kind: lastStatus === 401 || lastStatus === 403 ? 'config' : 'http',
  })
}

export async function sendMedia(params: {
  url: string
  apiKey: string
  instance: string
  number: string
  caption: string
  mediaDataUrl: string
  fileName?: string
}): Promise<void> {
  const match = params.mediaDataUrl.match(/^data:(.+?);base64,(.+)$/)
  if (!match) {
    throw new EvolutionError(
      'Imagem comercial inválida (espere data URL base64).',
      { kind: 'config' },
    )
  }
  const mimetype = match[1] ?? 'image/jpeg'
  const base64 = match[2] ?? ''
  const number = toEvolutionNumber(params.number)
  const fileName = params.fileName ?? 'oferta.jpg'

  const payloads: unknown[] = [
    {
      number,
      mediatype: 'image',
      mimetype,
      caption: params.caption,
      media: base64,
      fileName,
    },
    // algumas versões querem media com prefix data:
    {
      number,
      mediatype: 'image',
      mimetype,
      caption: params.caption,
      media: params.mediaDataUrl,
      fileName,
    },
  ]

  let lastStatus = 0
  let lastBody = ''
  for (const body of payloads) {
    const res = await evoFetch(
      params.url,
      params.apiKey,
      `/message/sendMedia/${encodeURIComponent(params.instance)}`,
      { method: 'POST', body: JSON.stringify(body) },
    )
    if (res.ok) return
    lastStatus = res.status
    lastBody = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) break
  }

  throw new EvolutionError(hintFromBody(lastBody, lastStatus || 0), {
    status: lastStatus,
    kind: 'http',
  })
}

/** Teste rápido de conectividade (usado no botão Testar). */
export async function testEvolutionConnection(params: {
  url: string
  apiKey: string
  instance: string
}): Promise<{ ok: boolean; message: string; status?: WaConnectionStatus }> {
  try {
    if (!params.url.trim() || !params.apiKey.trim() || !params.instance.trim()) {
      return {
        ok: false,
        message: 'Preencha URL, API key e nome da instância',
      }
    }
    const safety = isSafeEvolutionUrl(params.url)
    if (!safety.ok) return { ok: false, message: safety.reason ?? 'URL inválida' }

    const state = await getConnectionState(
      params.url,
      params.apiKey,
      params.instance,
    )
    if (state.status === 'error') {
      return { ok: false, message: state.error ?? 'Erro', status: 'error' }
    }
    const labels: Record<string, string> = {
      open: 'Conectado (open) — pronto pra enviar',
      close: 'Desconectado (close) — gere o QR',
      connecting: 'Conectando / aguardando QR',
      unknown: 'Status desconhecido — API respondeu',
    }
    return {
      ok: true,
      message: labels[state.status] ?? state.status,
      status: state.status,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
