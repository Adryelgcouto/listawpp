import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Auth mínima das rotas /api/wa/*.
 * Se LISTA_ZAP_WA_SECRET estiver definido no Vercel, exige o mesmo valor em:
 *   - header x-lista-zap-secret
 *   - ou Authorization: Bearer <secret>
 * Se o secret NÃO estiver configurado, libera (dev) mas marca aberto.
 */
export function assertWaAuth(
  req: VercelRequest,
  res: VercelResponse,
): boolean {
  const expected = (process.env.LISTA_ZAP_WA_SECRET || '').trim()
  if (!expected) {
    // Sem secret: open (dívida consciente). Preferir setar no Vercel.
    return true
  }

  const header =
    (req.headers['x-lista-zap-secret'] as string | undefined)?.trim() || ''
  const auth = (req.headers.authorization || '').trim()
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : ''

  if (header === expected || bearer === expected) {
    return true
  }

  res.status(401).json({
    error: true,
    message: 'Não autorizado. Configure LISTA_ZAP_WA_SECRET no app e no Vercel.',
  })
  return false
}
