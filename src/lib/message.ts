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
 * Blocos do texto + os separadores originais, pra remontar a mensagem
 * exatamente com a mesma estrutura depois da reescrita.
 */
export function splitIntoBlocks(text: string): {
  blocks: string[]
  seps: string[]
} {
  const norm = normalizeOutboundText(text)
  if (!norm) return { blocks: [], seps: [] }
  const parts = norm.split(/(\n+)/)
  const blocks: string[] = []
  const seps: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i] ?? ''
    if (i % 2 === 0) {
      if (p.trim()) blocks.push(p.trim())
    } else {
      seps.push(p)
    }
  }
  return { blocks, seps: seps.slice(0, Math.max(0, blocks.length - 1)) }
}

/** Remonta os blocos com os separadores da base (faltou separador → linha em branco). */
export function joinBlocks(blocks: string[], seps: string[] = []): string {
  return normalizeOutboundText(
    blocks
      .map((b, i) => (i === 0 ? b : `${seps[i - 1] ?? '\n\n'}${b}`))
      .join(''),
  )
}

/**
 * Quantos blocos a variação deve ter.
 * Base já em blocos → mesma quantidade. Base corrida → quebra em 2–3
 * (é o caso do template de 1 linha, que chegava como paredão no WhatsApp).
 */
export function targetBlockCount(base: string): number {
  const { blocks } = splitIntoBlocks(base)
  if (blocks.length > 1) return blocks.length
  const len = normalizeOutboundText(base).length
  if (len < 90) return 1
  if (len < 220) return 2
  return 3
}

/** Frases do texto, preservando a pontuação final. */
function splitSentences(text: string): string[] {
  return normalizeOutboundText(text)
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Quebra um texto corrido em blocos de WhatsApp: saudação / corpo / convite.
 * Usado pelo botão "Formatar em blocos" — não inventa nem remove conteúdo.
 */
export function formatAsBlocks(text: string): string {
  const sentences = splitSentences(text)
  if (sentences.length <= 1) return normalizeOutboundText(text)

  const first = sentences[0] ?? ''
  const last = sentences[sentences.length - 1] ?? ''

  if (sentences.length === 2) return joinBlocks([first, last])

  // saudação curta ("Olá Maria!") gruda com a frase seguinte
  let head = [first]
  let rest = sentences.slice(1, -1)
  if (first.length <= 18 && rest.length > 1) {
    head = [`${first} ${rest[0]}`]
    rest = rest.slice(1)
  }

  const middle = rest.join(' ').trim()
  return joinBlocks(middle ? [head[0]!, middle, last] : [head[0]!, last])
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
