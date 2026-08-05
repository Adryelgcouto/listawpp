import { stripCpfEverywhere } from './security'

/**
 * Normaliza o texto que vai pro WhatsApp PRESERVANDO os parágrafos.
 * - CRLF/CR viram \n (Evolution/WhatsApp só entende \n)
 * - tira espaço sobrando nas pontas de cada linha
 * - no máximo 1 linha em branco seguida (2 quebras)
 */
export function normalizeOutboundText(text: string): string {
  return (text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Apply template with {nome}. Never inject CPF.
 */
export function applyTemplate(template: string, nome: string): string {
  const safeName = (nome || 'cliente').trim() || 'cliente'
  return normalizeOutboundText(
    template.replaceAll('{nome}', safeName).replaceAll('{NOME}', safeName),
  )
}

export function localRewrite(base: string, seed: number): string {
  const openers = ['', 'Bom dia! ', 'Boa tarde! ', 'Oi, tudo bem? ', 'Olá! ']
  const closers = [
    '',
    ' Qualquer dúvida, é só responder.',
    ' Fico no aguardo.',
    ' Abraço!',
    ' Valeu!',
  ]
  const softTweaks: Array<(s: string) => string> = [
    (s) => s,
    (s) => s.replace(/!/g, '.'),
    (s) => s.replace(/\?/g, '??'),
    (s) => s.replace(/especial/gi, 'diferenciada'),
    (s) => s.replace(/condição/gi, 'oportunidade'),
    (s) => s.replace(/2 minutos/gi, 'poucos minutos'),
  ]

  const o = openers[seed % openers.length] ?? ''
  const c = closers[(seed * 3) % closers.length] ?? ''
  const tweak = softTweaks[(seed * 7) % softTweaks.length] ?? ((s: string) => s)
  let text = tweak(base).trim()
  if (o && !text.toLowerCase().startsWith(o.trim().toLowerCase().slice(0, 3))) {
    text = o + text.charAt(0).toLowerCase() + text.slice(1)
  }
  if (c && !text.endsWith(c.trim())) {
    text = text.replace(/[.!]?$/, '') + c
  }
  return stripCpfEverywhere(text.trim())
}

export function stripCpfFromText(text: string): string {
  return stripCpfEverywhere(text)
}
