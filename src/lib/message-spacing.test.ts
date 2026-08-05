/**
 * Regressão: mensagem do WhatsApp estava chegando toda grudada.
 * Causa: stripCpfFromText colapsava \s{2,} em " ", matando \n\n dos parágrafos.
 */
import { describe, expect, it } from 'vitest'
import { stripCpfFromText } from './cpf'
import { applyTemplate, normalizeOutboundText } from './message'
import { acceptRewriteOrBase, rewriteMessage } from './gemini'
import {
  assertSafeOutboundText,
  safeMessagePreview,
  sanitizeErrorMessage,
  sanitizePersonName,
} from './security'

const MULTI = `Olá {nome}! Tudo bem?

Passando pra te apresentar uma condição especial.

Posso te explicar em 2 minutos?`

describe('espaçamento da mensagem', () => {
  it('stripCpfFromText preserva quebras de linha', () => {
    const out = stripCpfFromText('Linha 1\n\nLinha 2\nLinha 3')
    expect(out).toBe('Linha 1\n\nLinha 2\nLinha 3')
  })

  it('stripCpfFromText remove CPF sem achatar o texto', () => {
    const out = stripCpfFromText('Oi Ana\n\nCPF 529.982.247-25\n\nAté logo')
    expect(out).toContain('[cpf-removido]')
    expect(out.split('\n\n')).toHaveLength(3)
  })

  it('lista de datas em linhas separadas não vira [cpf-removido]', () => {
    const datas = 'Turmas:\n12/08\n15/08\n20/08\n30/08'
    expect(stripCpfFromText(datas)).toBe(datas)
  })

  it('applyTemplate mantém os parágrafos e troca o nome', () => {
    const out = applyTemplate(MULTI, 'Yasmin')
    expect(out).toContain('Yasmin')
    expect(out.split('\n\n')).toHaveLength(3)
    expect(out).not.toContain('{nome}')
  })

  it('normalizeOutboundText normaliza CRLF, sobra de espaço e linhas vazias', () => {
    const out = normalizeOutboundText(
      '  Oi   Ana  \r\n\r\n\r\n\r\n   Segunda linha \t\r\n',
    )
    expect(out).toBe('Oi Ana\n\nSegunda linha')
  })

  it('rewrite desligado envia o template multi-linha intacto', async () => {
    const r = await rewriteMessage({
      apiKey: '',
      model: 'gemini-2.0-flash',
      template: MULTI,
      nome: 'Yasmin',
      seed: 1,
      useGemini: false,
    })
    expect(r.source).toBe('template')
    expect(r.text).toBe(applyTemplate(MULTI, 'Yasmin'))
    expect(r.text.split('\n\n')).toHaveLength(3)
  })

  it('assertSafeOutboundText não achata a mensagem', () => {
    const msg = applyTemplate(MULTI, 'Roberto')
    expect(assertSafeOutboundText(msg, 'teste')).toBe(msg)
  })

  it('preview da fila mostra as mesmas quebras que vão ser enviadas', () => {
    const msg = applyTemplate(MULTI, 'Roberto')
    expect(safeMessagePreview(msg)).toBe(msg)
  })

  it('rewrite que achata os parágrafos é rejeitado', () => {
    const base = applyTemplate(MULTI, 'Yasmin')
    const flat = base.replace(/\n+/g, ' ')
    expect(acceptRewriteOrBase(base, flat, 'Yasmin')).toBe(base)
  })

  it('rewrite que mantém os parágrafos é aceito', () => {
    const base = applyTemplate(MULTI, 'Yasmin')
    const ok =
      'Oi Yasmin, tudo certo?\n\nQueria te mostrar uma condição especial que abrimos.\n\nPosso te explicar em 2 minutos?'
    expect(acceptRewriteOrBase(base, ok, 'Yasmin')).toBe(ok)
  })

  it('log de erro continua em uma linha só', () => {
    expect(sanitizeErrorMessage('falha\n\nno   envio\n')).toBe(
      'falha no envio',
    )
  })

  it('nome nunca vira multi-linha', () => {
    expect(sanitizePersonName(' Ana\nMaria  Souza ')).toBe('Ana Maria Souza')
  })
})
