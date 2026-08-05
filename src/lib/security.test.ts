import { describe, expect, it } from 'vitest'
import {
  assertSafeOutboundText,
  containsCpf,
  maskNameForLog,
  maskPhoneForLog,
  registerRuntimeSecret,
  safeMessagePreview,
  sanitizeErrorMessage,
  sanitizeLogLine,
  sanitizePersonName,
  stripCpfEverywhere,
  isSafeEvolutionUrl,
} from './security'
import { applyTemplate, localRewrite } from './message'
import { isValidBrPhone, normalizePhone } from './phone'
import { isValidCpfDigits } from './cpf'

/** Formatos que o Claude provou que vazavam na C1 */
const LEAKY_FORMATS = [
  '529.982.247-25',
  '52998224725',
  '529 982 247 25',
  '529.982.247.25',
  '529-982-247-25',
  '529.982.24725',
  'doc529.982.247-25',
  'CPF:529982247-25',
]

describe('Onda 0 — CPF never leaks (C1)', () => {
  it.each(LEAKY_FORMATS)('strips format %s', (fmt) => {
    const raw = `Olá João ${fmt} tudo bem`
    const out = stripCpfEverywhere(raw)
    expect(containsCpf(out)).toBe(false)
    expect(out).not.toMatch(/529/)
  })

  it('strips CPF embedded in nome (pipeline real)', () => {
    const nome = sanitizePersonName('Maria Silva 529 982 247 25')
    const base = applyTemplate('Oi {nome}!', nome)
    const re = localRewrite(base, 3)
    const outbound = assertSafeOutboundText(re, 'test')
    expect(containsCpf(outbound)).toBe(false)
    expect(outbound).not.toMatch(/529/)
  })

  it('assertSafeOutboundText cleans and allows safe text', () => {
    const clean = assertSafeOutboundText('Oi Maria sem doc', 'test')
    expect(clean).toContain('Maria')
  })

  it('valid check-digit CPF known good', () => {
    expect(isValidCpfDigits('52998224725')).toBe(true)
  })
})

describe('Logs / secrets', () => {
  it('masks phones and strips cpf in logs', () => {
    const log = sanitizeLogLine(
      'Enviando para Maria (5511987654321) cpf 529.982.247-25',
    )
    expect(log).not.toMatch(/987654321/)
    expect(containsCpf(log)).toBe(false)
    expect(maskPhoneForLog('5511987654321')).toMatch(/\*\*\*\*\*/)
  })

  it('name log is initials only (L1)', () => {
    expect(maskNameForLog('Maria Silva Santos')).toMatch(/^[A-Z]\.[A-Z]\.$/i)
  })

  it('redacts registered runtime secrets by value (H4)', () => {
    registerRuntimeSecret('my-evo-uuid-secret-key-999')
    const e = sanitizeErrorMessage('failed my-evo-uuid-secret-key-999 body')
    expect(e).toContain('[secret]')
    expect(e).not.toContain('my-evo-uuid')
  })

  it('sanitizes api keys from errors', () => {
    const e = sanitizeErrorMessage(
      'failed AIzaSyDummyKeyValue123456789012345 body',
    )
    expect(e).toContain('[secret]')
  })

  it('safe preview has no cpf', () => {
    expect(safeMessagePreview('doc 390.533.447-05')).not.toMatch(/390/)
  })
})

describe('Phone validation (H6)', () => {
  it('accepts valid BR mobile', () => {
    expect(isValidBrPhone('11987654321')).toBe(true)
    expect(normalizePhone('11987654321')).toBe('5511987654321')
  })

  it('rejects garbage', () => {
    expect(isValidBrPhone('123')).toBe(false)
    expect(isValidBrPhone('00000000000')).toBe(false)
  })
})

describe('Evolution URL (M6)', () => {
  it('allows loopback, LAN http and remote https', () => {
    expect(isSafeEvolutionUrl('http://localhost:8081').ok).toBe(true)
    expect(isSafeEvolutionUrl('http://192.168.0.198:8081').ok).toBe(true)
    expect(isSafeEvolutionUrl('http://10.0.0.5:8081').ok).toBe(true)
    expect(isSafeEvolutionUrl('https://evo.example.com').ok).toBe(true)
  })

  it('blocks public http', () => {
    expect(isSafeEvolutionUrl('http://evil.com').ok).toBe(false)
  })
})
