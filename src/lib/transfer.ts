/**
 * Exportar / transferir a fila entre aparelhos.
 *
 * Dois formatos:
 * - CSV de pendentes: o que ainda falta enviar, no mesmo formato que o
 *   importador de Excel/CSV já lê (Nome;Telefone).
 * - JSON de transferência: a lista inteira COM o status de cada contato, pra
 *   continuar no outro celular sem reenviar pra quem já recebeu.
 *
 * Nunca sai CPF nem chave de API — só nome, telefone, status e o template.
 */
import type { QueueItem, QueueItemStatus } from '@/types'
import { isValidBrPhone, normalizePhone } from './phone'
import { sanitizePersonName } from './security'
import { normalizeOutboundText } from './message'

export const TRANSFER_VERSION = 1
export const TRANSFER_APP = 'lista-zap' as const

export type TransferContact = {
  nome: string
  telefone: string
  status: QueueItemStatus
  enviadoEm?: string
}

export type TransferFile = {
  app: typeof TRANSFER_APP
  version: number
  exportadoEm: string
  mensagem?: string
  contatos: TransferContact[]
}

/** 'sending' não é estado transferível — quem estava no meio volta pra fila. */
function portableStatus(status: QueueItemStatus): QueueItemStatus {
  return status === 'sending' ? 'pending' : status
}

/** O que ainda falta enviar: pendente, quem estava enviando e as falhas. */
export function pendingItems(items: QueueItem[]): QueueItem[] {
  return items.filter(
    (i) =>
      i.status === 'pending' || i.status === 'sending' || i.status === 'failed',
  )
}

function csvCell(value: string): string {
  const v = value ?? ''
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/**
 * CSV pt-BR (separador ;, com BOM pro Excel não comer o acento).
 * Reimportável pelo próprio app — a coluna Status é ignorada na leitura.
 */
export function buildPendingCsv(items: QueueItem[]): string {
  const rows = pendingItems(items).map((i) =>
    [
      csvCell(sanitizePersonName(i.name) || i.name),
      csvCell(i.phone),
      csvCell(portableStatus(i.status)),
    ].join(';'),
  )
  return `﻿${['Nome;Telefone;Status', ...rows].join('\r\n')}\r\n`
}

/** Arquivo de transferência: lista inteira com status. Sem CPF, sem chave. */
export function buildTransferFile(params: {
  items: QueueItem[]
  messageTemplate?: string
  now: string
}): TransferFile {
  return {
    app: TRANSFER_APP,
    version: TRANSFER_VERSION,
    exportadoEm: params.now,
    mensagem: params.messageTemplate
      ? normalizeOutboundText(params.messageTemplate)
      : undefined,
    contatos: params.items.map((i) => ({
      nome: sanitizePersonName(i.name) || i.name,
      telefone: i.phone,
      status: portableStatus(i.status),
      enviadoEm: i.sentAt,
    })),
  }
}

export function serializeTransferFile(file: TransferFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

const VALID_STATUS: QueueItemStatus[] = [
  'pending',
  'sending',
  'sent',
  'failed',
  'skipped',
]

/**
 * Lê o arquivo de transferência. Erro vira mensagem humana, não exception.
 * `ignorados` = linhas sem telefone válido pra WhatsApp BR (mesma régua do
 * importador de planilha).
 */
export function parseTransferFile(
  text: string,
):
  | { ok: true; file: TransferFile; ignorados: number }
  | { ok: false; error: string } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Arquivo não é um backup válido (JSON inválido).' }
  }

  const obj = data as Partial<TransferFile>
  if (!obj || typeof obj !== 'object' || obj.app !== TRANSFER_APP) {
    return { ok: false, error: 'Esse arquivo não é um backup do Lista Zap.' }
  }
  if (!Array.isArray(obj.contatos)) {
    return { ok: false, error: 'Backup sem a lista de contatos.' }
  }

  const contatos: TransferContact[] = []
  let ignorados = 0
  const vistos = new Set<string>()
  for (const raw of obj.contatos) {
    const c = raw as Partial<TransferContact>
    const telefone = normalizePhone(String(c?.telefone ?? ''))
    if (!telefone || !isValidBrPhone(telefone) || vistos.has(telefone)) {
      ignorados++
      continue
    }
    vistos.add(telefone)
    const status = VALID_STATUS.includes(c?.status as QueueItemStatus)
      ? portableStatus(c!.status as QueueItemStatus)
      : 'pending'
    contatos.push({
      nome: sanitizePersonName(String(c?.nome ?? '')) || 'Cliente',
      telefone,
      status,
      enviadoEm: typeof c?.enviadoEm === 'string' ? c.enviadoEm : undefined,
    })
  }

  if (contatos.length === 0) {
    return { ok: false, error: 'Backup sem nenhum telefone válido.' }
  }

  return {
    ok: true,
    ignorados,
    file: {
      app: TRANSFER_APP,
      version: typeof obj.version === 'number' ? obj.version : TRANSFER_VERSION,
      exportadoEm:
        typeof obj.exportadoEm === 'string' ? obj.exportadoEm : '',
      mensagem: typeof obj.mensagem === 'string' ? obj.mensagem : undefined,
      contatos,
    },
  }
}

export type MergeResult = {
  items: QueueItem[]
  novos: number
  atualizados: number
  /** Já constavam como enviados de um lado ou do outro — não vão de novo. */
  jaEnviados: number
}

/**
 * Junta a lista importada com a fila local, casando por telefone.
 *
 * Regra que importa: **'sent' de qualquer lado ganha**. Nunca rebaixa um envio
 * já feito pra pendente — é o que impede o outro celular de mandar de novo
 * pra quem já recebeu. Nos outros casos vale o status do arquivo, que é a
 * lista que a pessoa está movendo.
 */
export function mergeImportedContacts(
  items: QueueItem[],
  contatos: TransferContact[],
  makeItem: (c: TransferContact) => QueueItem,
): MergeResult {
  const byPhone = new Map<string, number>()
  items.forEach((item, idx) => {
    if (!byPhone.has(item.phone)) byPhone.set(item.phone, idx)
  })

  const next = [...items]
  let novos = 0
  let atualizados = 0
  let jaEnviados = 0

  for (const c of contatos) {
    const idx = byPhone.get(c.telefone)
    if (idx === undefined) {
      const created = makeItem(c)
      byPhone.set(c.telefone, next.length)
      next.push(created)
      novos++
      if (created.status === 'sent') jaEnviados++
      continue
    }

    const local = next[idx]!
    const localSent = local.status === 'sent'
    const status: QueueItemStatus =
      localSent || c.status === 'sent' ? 'sent' : c.status
    if (status === 'sent') jaEnviados++
    if (status === local.status && (local.name || '') === c.nome) continue

    next[idx] = {
      ...local,
      name: c.nome || local.name,
      status,
      sentAt: status === 'sent' ? (local.sentAt ?? c.enviadoEm) : local.sentAt,
    }
    atualizados++
  }

  return { items: next, novos, atualizados, jaEnviados }
}

/** Nome de arquivo com a data — dois exports do mesmo dia não se confundem. */
export function transferFileName(prefix: string, iso: string, ext: string) {
  const stamp = iso.slice(0, 16).replace('T', '-').replace(/:/g, '')
  return `lista-zap-${prefix}-${stamp}.${ext}`
}

/** Dispara o download no browser. */
export function downloadTextFile(
  filename: string,
  text: string,
  mime: string,
): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
