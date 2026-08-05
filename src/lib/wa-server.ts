/**
 * Cliente do backend /api/wa/* na Vercel.
 * Chave Evolution fica no servidor — o usuário não cola nada.
 * Se VITE_LISTA_ZAP_WA_SECRET existir, manda no header.
 */

export type ServerWaStatus = {
  ok?: boolean
  status?: string
  instance?: string
  configured?: boolean
  error?: boolean
  message?: string
  httpStatus?: number
}

function waHeaders(json = false): HeadersInit {
  const secret = (
    import.meta.env.VITE_LISTA_ZAP_WA_SECRET as string | undefined
  )?.trim()
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (secret) {
    h['x-lista-zap-secret'] = secret
    h.Authorization = `Bearer ${secret}`
  }
  return h
}

/** Parse seguro: Vercel às vezes devolve texto "A server error has occurred". */
async function readJson<T extends Record<string, unknown>>(
  r: Response,
): Promise<T> {
  const text = await r.text()
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error(`API vazia (HTTP ${r.status})`)
  }
  try {
    return JSON.parse(trimmed) as T
  } catch {
    // mensagem humana em vez de "Unexpected token 'A'..."
    const hint = trimmed
      .replace(/\s+/g, ' ')
      .slice(0, 140)
    if (/FUNCTION_INVOCATION_FAILED|server error/i.test(hint)) {
      throw new Error(
        'API WhatsApp caiu no servidor (Vercel). Tente de novo em 30s ou use modo demo.',
      )
    }
    throw new Error(
      r.ok
        ? `Resposta inválida da API: ${hint}`
        : `API HTTP ${r.status}: ${hint}`,
    )
  }
}

export async function serverWaStatus(): Promise<ServerWaStatus> {
  try {
    const r = await fetch('/api/wa/status', { headers: waHeaders() })
    const data = await readJson<ServerWaStatus & Record<string, unknown>>(r)
    if (!r.ok && !data.message) {
      return {
        error: true,
        message: `Status HTTP ${r.status}`,
        ...data,
      }
    }
    return data
  } catch (e) {
    return {
      error: true,
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function serverWaQr(): Promise<{
  ok: boolean
  qr?: string | null
  pairingCode?: string | null
  message?: string
  instance?: string
  status?: string
}> {
  try {
    const r = await fetch('/api/wa/qr', { headers: waHeaders() })
    const data = await readJson<{
      ok?: boolean
      qr?: string | null
      pairingCode?: string | null
      message?: string
      instance?: string
      status?: string
      error?: boolean
    }>(r)
    return {
      ok: Boolean(data.ok),
      qr: data.qr,
      pairingCode: data.pairingCode,
      message: data.message,
      instance: data.instance,
      status: data.status,
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function serverWaSend(params: {
  number: string
  text: string
  mediaDataUrl?: string | null
}): Promise<void> {
  const r = await fetch('/api/wa/send', {
    method: 'POST',
    headers: waHeaders(true),
    body: JSON.stringify({
      number: params.number,
      text: params.text,
      mediaDataUrl: params.mediaDataUrl || undefined,
      caption: params.text,
    }),
  })
  const data = await readJson<{ message?: string; ok?: boolean; error?: boolean }>(
    r,
  )
  if (!r.ok || data.error) {
    throw new Error(data.message || `Envio falhou (${r.status})`)
  }
}

/** true se estamos no deploy (API server-side disponível) */
export function hasServerWaApi(): boolean {
  if (typeof window === 'undefined') return false
  // local vite não tem as functions /api/wa (só /evo proxy)
  // em vercel hostname .vercel.app → sim
  return (
    /\.vercel\.app$/i.test(window.location.hostname) ||
    window.location.hostname === 'listawpp.vercel.app'
  )
}
