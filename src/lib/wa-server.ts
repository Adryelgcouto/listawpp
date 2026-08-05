/**
 * Cliente do backend /api/wa/* na Vercel.
 * Chave Evolution fica no servidor — o usuário não cola nada.
 */

export type ServerWaStatus = {
  ok?: boolean
  status?: string
  instance?: string
  configured?: boolean
  error?: boolean
  message?: string
}

export async function serverWaStatus(): Promise<ServerWaStatus> {
  const r = await fetch('/api/wa/status')
  return (await r.json()) as ServerWaStatus
}

export async function serverWaQr(): Promise<{
  ok: boolean
  qr?: string | null
  pairingCode?: string | null
  message?: string
  instance?: string
}> {
  const r = await fetch('/api/wa/qr')
  return (await r.json()) as {
    ok: boolean
    qr?: string | null
    pairingCode?: string | null
    message?: string
    instance?: string
  }
}

export async function serverWaSend(params: {
  number: string
  text: string
  mediaDataUrl?: string | null
}): Promise<void> {
  const r = await fetch('/api/wa/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number: params.number,
      text: params.text,
      mediaDataUrl: params.mediaDataUrl || undefined,
      caption: params.text,
    }),
  })
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { message?: string }
    throw new Error(j.message || `Envio falhou (${r.status})`)
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
