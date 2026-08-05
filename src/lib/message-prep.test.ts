import { describe, expect, it } from 'vitest'
import { rewriteMessage } from './gemini'

describe('rewriteMessage — produto confiável', () => {
  it('rewrite desligado devolve template exato com nome', async () => {
    const r = await rewriteMessage({
      apiKey: '',
      model: 'gemini-2.0-flash',
      template: 'Olá {nome}! Condição especial pra você. Posso te explicar?',
      nome: 'Yasmin',
      seed: 1,
      useGemini: false,
    })
    expect(r.source).toBe('template')
    expect(r.text).toContain('Yasmin')
    expect(r.text).toContain('Condição especial')
    expect(r.text.length).toBeGreaterThan(40)
  })

  it('sem API key com rewrite on → fallback template', async () => {
    const r = await rewriteMessage({
      apiKey: '   ',
      model: 'gemini-2.0-flash',
      template: 'Oi {nome}, tudo bem?',
      nome: 'Roberto',
      seed: 2,
      useGemini: true,
    })
    expect(r.source).toBe('fallback')
    expect(r.text).toContain('Roberto')
    expect(r.reason).toMatch(/key|template/i)
  })
})
