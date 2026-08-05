/** Digits only */
export function digitsOnly(value: string): string {
  return (value || '').replace(/\D/g, '')
}

/**
 * Normalize BR phones for WhatsApp:
 * - strip non-digits
 * - if 10/11 digits (local), prefix 55
 * - keep 12/13 with country already present
 */
export function normalizePhone(raw: string): string {
  let d = digitsOnly(raw)
  if (!d) return ''
  d = d.replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) {
    d = `55${d}`
  }
  return d
}

export function formatPhoneDisplay(phone: string): string {
  const d = digitsOnly(phone)
  if (!d) return '—'

  let local = d
  if (local.startsWith('55') && local.length >= 12) {
    local = local.slice(2)
  }

  if (local.length === 11) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  }
  if (local.length === 10) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  }
  if (d.startsWith('55')) return `+${d}`
  return d
}

/**
 * H6: validação real de telefone BR móvel/fixo.
 * 55 + DDD (11–99) + 8 ou 9 dígitos.
 */
export function isValidBrPhone(phone: string): boolean {
  const d = normalizePhone(phone)
  if (!(d.length === 12 || d.length === 13)) return false
  if (!d.startsWith('55')) return false
  const ddd = Number(d.slice(2, 4))
  if (ddd < 11 || ddd > 99) return false
  const rest = d.slice(4)
  // móvel: 9 dígitos começando com 9; fixo: 8 dígitos
  if (rest.length === 9) return rest.startsWith('9')
  if (rest.length === 8) return /^[2-5]/.test(rest)
  return false
}
