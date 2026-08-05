import { describe, expect, it } from 'vitest'
import { buildRewritePrompt } from './gemini'

describe('buildRewritePrompt', () => {
  it('exige preservação de identidade e concisão', () => {
    const p = buildRewritePrompt('Olá Maria! Condição especial pra você.')
    expect(p).toMatch(/IDENTIDADE/i)
    expect(p).toMatch(/NÃO invente/i)
    expect(p).toMatch(/Conciso|conciso|280/i)
    expect(p).toMatch(/Assertivo|assertivo/i)
    expect(p).toMatch(/CPF/)
    expect(p).toContain('Olá Maria! Condição especial pra você.')
    expect(p).toMatch(/somente o texto final/i)
  })

  it('não pede criatividade livre que mude a oferta', () => {
    const p = buildRewritePrompt('base')
    expect(p).not.toMatch(/seja criativo ao máximo/i)
    expect(p).toMatch(/mesma oferta|mesmo objetivo|NÃO mude o produto/i)
  })
})
