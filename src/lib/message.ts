import { stripCpfEverywhere } from './security'

/**
 * Apply template with {nome}. Never inject CPF.
 */
export function applyTemplate(template: string, nome: string): string {
  const safeName = (nome || 'cliente').trim() || 'cliente'
  return template.replaceAll('{nome}', safeName).replaceAll('{NOME}', safeName)
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
