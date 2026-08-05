import { describe, expect, it } from 'vitest'
import {
  buildPendingCsv,
  buildTransferFile,
  mergeImportedContacts,
  parseTransferFile,
  pendingItems,
  serializeTransferFile,
  transferFileName,
  type TransferContact,
} from './transfer'
import type { QueueItem, QueueItemStatus } from '@/types'

function item(
  phone: string,
  status: QueueItemStatus,
  name = 'Ana',
  extra: Partial<QueueItem> = {},
): QueueItem {
  return {
    id: `q-${phone}`,
    clientId: `c-${phone}`,
    name,
    phone,
    status,
    createdAt: '2026-08-05T10:00:00.000Z',
    attempts: 0,
    ...extra,
  }
}

const FILA: QueueItem[] = [
  item('5511987654321', 'sent', 'Ana', { sentAt: '2026-08-05T10:05:00.000Z' }),
  item('5511912345678', 'pending', 'Bruno'),
  item('5521998765432', 'failed', 'Carla'),
  item('5531988887777', 'skipped', 'Diego'),
  item('5541977776666', 'sending', 'Elisa'),
]

const NOW = '2026-08-05T12:30:00.000Z'

describe('o que ainda falta', () => {
  it('pendente, em envio e falha contam como faltando', () => {
    expect(pendingItems(FILA).map((i) => i.name)).toEqual([
      'Bruno',
      'Carla',
      'Elisa',
    ])
  })

  it('CSV sai no formato que o próprio importador lê', () => {
    const csv = buildPendingCsv(FILA)
    const linhas = csv.replace(/^﻿/, '').trim().split('\r\n')
    expect(linhas[0]).toBe('Nome;Telefone;Status')
    expect(linhas).toHaveLength(4)
    expect(linhas[1]).toBe('Bruno;5511912345678;pending')
    // quem estava no meio do envio volta como pendente
    expect(linhas[3]).toBe('Elisa;5541977776666;pending')
    expect(csv.startsWith('﻿')).toBe(true)
  })

  it('CSV escapa nome com ponto e vírgula', () => {
    const csv = buildPendingCsv([item('5511912345678', 'pending', 'Souza; Ana')])
    expect(csv).toContain('"Souza; Ana";5511912345678')
  })

  it('não exporta CSV de quem já foi enviado', () => {
    expect(buildPendingCsv(FILA)).not.toContain('5511987654321')
  })
})

describe('arquivo de transferência', () => {
  it('leva a fila inteira com status e não leva CPF nem chave', () => {
    const file = buildTransferFile({
      items: FILA,
      messageTemplate: 'Olá {nome}!\n\nTudo bem?',
      now: NOW,
    })
    expect(file.app).toBe('lista-zap')
    expect(file.contatos).toHaveLength(5)
    expect(file.contatos[0]).toMatchObject({
      telefone: '5511987654321',
      status: 'sent',
    })
    // 'sending' não é estado transferível
    expect(file.contatos[4]?.status).toBe('pending')

    const json = serializeTransferFile(file)
    expect(json).not.toMatch(/cpf/i)
    expect(json).not.toMatch(/apikey|api_key|evolution|gemini/i)
    expect(file.mensagem).toBe('Olá {nome}!\n\nTudo bem?')
  })

  it('ida e volta preserva os status', () => {
    const json = serializeTransferFile(
      buildTransferFile({ items: FILA, now: NOW }),
    )
    const parsed = parseTransferFile(json)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.contatos.map((c) => c.status)).toEqual([
      'sent',
      'pending',
      'failed',
      'skipped',
      'pending',
    ])
  })

  it('recusa arquivo que não é do app', () => {
    const r = parseTransferFile('{"app":"outro-app","contatos":[]}')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/não é um backup do Lista Zap/i)
  })

  it('recusa JSON quebrado com mensagem humana', () => {
    const r = parseTransferFile('{"app":"lista-zap","contatos":[')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/JSON inválido/i)
  })

  it('ignora telefone inválido e duplicado, e conta quantos', () => {
    const r = parseTransferFile(
      JSON.stringify({
        app: 'lista-zap',
        contatos: [
          { nome: 'Ana', telefone: '11987654321', status: 'sent' },
          { nome: 'Ana de novo', telefone: '5511987654321', status: 'pending' },
          { nome: 'Ruim', telefone: '123', status: 'pending' },
          { nome: 'Vazio', telefone: '', status: 'pending' },
        ],
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.file.contatos).toHaveLength(1)
    expect(r.file.contatos[0]?.telefone).toBe('5511987654321')
    expect(r.ignorados).toBe(3)
  })

  it('status desconhecido vira pendente', () => {
    const r = parseTransferFile(
      JSON.stringify({
        app: 'lista-zap',
        contatos: [
          { nome: 'Ana', telefone: '5511987654321', status: 'sabotado' },
        ],
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.file.contatos[0]?.status).toBe('pending')
  })

  it('nome do arquivo carrega a data', () => {
    expect(transferFileName('fila', NOW, 'json')).toBe(
      'lista-zap-fila-2026-08-05-1230.json',
    )
  })
})

describe('merge na importação', () => {
  const novo = (c: TransferContact): QueueItem =>
    item(c.telefone, c.status, c.nome, { id: `novo-${c.telefone}` })

  it('quem já foi enviado aqui não volta a pendente', () => {
    const r = mergeImportedContacts(
      [item('5511987654321', 'sent', 'Ana')],
      [{ nome: 'Ana', telefone: '5511987654321', status: 'pending' }],
      novo,
    )
    expect(r.items[0]?.status).toBe('sent')
    expect(r.jaEnviados).toBe(1)
    expect(r.novos).toBe(0)
  })

  it('quem foi enviado no outro aparelho entra como enviado', () => {
    const r = mergeImportedContacts(
      [item('5511912345678', 'pending', 'Bruno')],
      [{ nome: 'Bruno', telefone: '5511912345678', status: 'sent' }],
      novo,
    )
    expect(r.items[0]?.status).toBe('sent')
    expect(r.atualizados).toBe(1)
    expect(r.jaEnviados).toBe(1)
  })

  it('contato que não existe aqui entra como novo', () => {
    const r = mergeImportedContacts(
      [],
      [{ nome: 'Carla', telefone: '5521998765432', status: 'pending' }],
      novo,
    )
    expect(r.novos).toBe(1)
    expect(r.items).toHaveLength(1)
    expect(r.items[0]?.status).toBe('pending')
  })

  it('cenário real: continua a lista do outro celular sem repetir envio', () => {
    // celular A mandou pra Ana e parou; celular B está zerado
    const doArquivo: TransferContact[] = [
      { nome: 'Ana', telefone: '5511987654321', status: 'sent' },
      { nome: 'Bruno', telefone: '5511912345678', status: 'pending' },
      { nome: 'Carla', telefone: '5521998765432', status: 'pending' },
    ]
    const r = mergeImportedContacts([], doArquivo, novo)
    expect(r.novos).toBe(3)
    expect(r.jaEnviados).toBe(1)
    expect(r.items.filter((i) => i.status === 'pending')).toHaveLength(2)
    expect(
      r.items.find((i) => i.phone === '5511987654321')?.status,
    ).toBe('sent')
  })

  it('importar duas vezes não duplica contato', () => {
    const doArquivo: TransferContact[] = [
      { nome: 'Bruno', telefone: '5511912345678', status: 'pending' },
    ]
    const um = mergeImportedContacts([], doArquivo, novo)
    const dois = mergeImportedContacts(um.items, doArquivo, novo)
    expect(dois.items).toHaveLength(1)
    expect(dois.novos).toBe(0)
  })
})
