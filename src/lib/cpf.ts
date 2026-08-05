import { digitsOnly } from './phone'

/** Validação completa com dígitos verificadores. */
export function isValidCpfDigits(d: string): boolean {
  if (!/^\d{11}$/.test(d)) return false
  if (/^(\d)\1{10}$/.test(d)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i)
  let rest = (sum * 10) % 11
  if (rest === 10) rest = 0
  if (rest !== Number(d[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i)
  rest = (sum * 10) % 11
  if (rest === 10) rest = 0
  return rest === Number(d[10])
}

/** Aceita 11 dígitos não-repetidos (OCR) mesmo se check digit falhar. */
export function looksLikeLooseCpf(d: string): boolean {
  return d.length === 11 && !/^(\d)\1{10}$/.test(d)
}

export function normalizeCpf(raw: string): string {
  const d = digitsOnly(raw)
  if (d.length === 11) return d
  return d.length <= 11 ? d : d.slice(0, 11)
}

export function maskCpf(raw: string, revealed = false): string {
  const d = digitsOnly(raw)
  if (!d) return '—'
  if (d.length !== 11) {
    return revealed ? d : '•••.***.***-**'
  }
  const formatted = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (revealed) return formatted
  return `***.***.***-${d.slice(9)}`
}

export function formatCpf(raw: string): string {
  const d = digitsOnly(raw)
  if (d.length !== 11) return d || ''
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function looksLikeCpf(raw: string): boolean {
  const d = digitsOnly(raw)
  return d.length === 11 && isValidCpfDigits(d)
}

function windowIsCpf(d: string): boolean {
  return isValidCpfDigits(d) || looksLikeLooseCpf(d)
}

/**
 * Limpa espaço sobrando SEM destruir quebra de linha.
 * A mensagem do WhatsApp precisa manter parágrafos — colapsar \n\n em " "
 * fazia a mensagem chegar toda grudada.
 */
function tidySpacesKeepingLineBreaks(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      // espaços/tabs repetidos → 1 espaço (nunca mexe em \n)
      .replace(/[^\S\n]{2,}/g, ' ')
      // espaço sobrando no fim da linha
      .replace(/[^\S\n]+\n/g, '\n')
      // espaço sobrando no início da linha
      .replace(/\n[^\S\n]+/g, '\n')
      .trim()
  )
}

/**
 * Sequência de 11+ dígitos com separadores comuns de CPF.
 * NÃO inclui \n: CPF nunca é escrito quebrado em duas linhas, e casar através
 * da quebra apagaria conteúdo legítimo (ex.: lista de datas, uma por linha).
 */
const CPF_ISH = /(?:\d[\d.\-/ \t]*){10}\d/g

/**
 * C1 — Remove CPF de texto livre.
 * Casa 11 dígitos com separadores [.\- /] (sem depender de \b).
 * Protege telefones 55… antes de redigir.
 */
export function stripCpfFromText(text: string): string {
  if (!text) return text

  const phones: string[] = []
  let out = text.replace(/55\d{10,11}/g, (m) => {
    phones.push(m)
    return `__PHONE_${phones.length - 1}__`
  })

  // Trechos com 11+ dígitos e separadores
  out = out.replace(CPF_ISH, (match) => {
    const digits = match.replace(/\D/g, '')
    if (digits.length < 11) return match
    for (let i = 0; i <= digits.length - 11; i++) {
      if (windowIsCpf(digits.slice(i, i + 11))) {
        return '[cpf-removido]'
      }
    }
    return match
  })

  // 11 dígitos contíguos restantes
  out = out.replace(/\d{11}/g, (m) => (windowIsCpf(m) ? '[cpf-removido]' : m))

  out = out.replace(/__PHONE_(\d+)__/g, (_, i) => phones[Number(i)] ?? '')
  return tidySpacesKeepingLineBreaks(out)
}

export function containsCpfPattern(text: string): boolean {
  if (!text) return false

  // ignore protected phone shapes for detection of residual CPF
  const withoutPhones = text.replace(/55\d{10,11}/g, '')

  const chunks = withoutPhones.match(CPF_ISH) ?? []
  for (const chunk of chunks) {
    const digits = chunk.replace(/\D/g, '')
    for (let i = 0; i <= digits.length - 11; i++) {
      if (windowIsCpf(digits.slice(i, i + 11))) return true
    }
  }
  const bare = withoutPhones.match(/\d{11}/g) ?? []
  return bare.some(windowIsCpf)
}
