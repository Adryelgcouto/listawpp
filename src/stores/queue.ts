import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Client, QueueItem, QueueLog } from '@/types'
import { createId } from '@/lib/id'
import { sanitizeLogLine, safeMessagePreview } from '@/lib/security'
import { isValidBrPhone } from '@/lib/phone'
import { QueuePersistSchema, safeParsePersist } from '@/lib/schemas'
import { sanitizePersonName } from '@/lib/security'
import {
  mergeImportedContacts,
  type MergeResult,
  type TransferContact,
} from '@/lib/transfer'

interface QueueState {
  items: QueueItem[]
  running: boolean
  paused: boolean
  logs: QueueLog[]
  sentToday: number
  sentTodayDate: string
  lastBatchCount: number

  enqueueClients: (clients: Client[]) => number
  /** Importa backup de outro aparelho — 'sent' de qualquer lado nunca vira pendente. */
  importContacts: (
    contatos: TransferContact[],
    clientIdForPhone: (phone: string) => string | undefined,
  ) => MergeResult
  setRunning: (v: boolean) => void
  setPaused: (v: boolean) => void
  updateItem: (id: string, patch: Partial<QueueItem>) => void
  skipItem: (id: string) => void
  resetFailedToPending: () => void
  resetAllPending: () => void
  clearQueue: () => void
  clearLogs: () => void
  addLog: (level: QueueLog['level'], message: string, itemId?: string) => void
  bumpSentToday: () => void
  bumpBatch: () => void
  resetBatch: () => void
  claimNextPending: () => QueueItem | null
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function ensureSentToday(state: QueueState): Partial<QueueState> {
  const t = todayKey()
  if (state.sentTodayDate !== t) {
    return { sentToday: 0, sentTodayDate: t }
  }
  return {}
}

export const useQueueStore = create<QueueState>()(
  persist(
    (set, get) => ({
      items: [],
      running: false,
      paused: false,
      logs: [],
      sentToday: 0,
      sentTodayDate: todayKey(),
      lastBatchCount: 0,

      enqueueClients: (clients) => {
        const existingPhones = new Set(
          get()
            .items.filter((i) => i.status === 'pending' || i.status === 'sending')
            .map((i) => i.phone),
        )
        const stamp = new Date().toISOString()
        const fresh: QueueItem[] = []
        for (const c of clients) {
          if (!c.phone || existingPhones.has(c.phone)) continue
          if (!isValidBrPhone(c.phone)) continue
          if (c.contactStatus === 'blocked') continue
          fresh.push({
            id: createId('q'),
            clientId: c.id,
            name: sanitizePersonName(c.name) || c.name,
            phone: c.phone,
            status: 'pending',
            createdAt: stamp,
            attempts: 0,
          })
          existingPhones.add(c.phone)
        }
        if (fresh.length) {
          set((s) => ({ items: [...s.items, ...fresh] }))
        }
        return fresh.length
      },

      setRunning: (v) => set({ running: v, paused: v ? false : get().paused }),
      setPaused: (v) => set({ paused: v, running: v ? false : get().running }),

      updateItem: (id, patch) =>
        set((s) => ({
          items: s.items.map((i) => {
            if (i.id !== id) return i
            const next = { ...i, ...patch }
            if (patch.messagePreview != null) {
              next.messagePreview = safeMessagePreview(patch.messagePreview)
            }
            if (patch.error != null) {
              next.error = sanitizeLogLine(patch.error)
            }
            return next
          }),
        })),

      skipItem: (id) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, status: 'skipped' as const } : i,
          ),
        })),

      importContacts: (contatos, clientIdForPhone) => {
        const stamp = new Date().toISOString()
        const result = mergeImportedContacts(get().items, contatos, (c) => ({
          id: createId('q'),
          clientId: clientIdForPhone(c.telefone) ?? '',
          name: sanitizePersonName(c.nome) || c.nome,
          phone: c.telefone,
          status: c.status,
          createdAt: stamp,
          sentAt: c.enviadoEm,
          attempts: 0,
        }))
        set({ items: result.items })
        return result
      },

      resetFailedToPending: () =>
        set((s) => ({
          items: s.items.map((i) =>
            i.status === 'failed'
              ? { ...i, status: 'pending' as const, error: undefined }
              : i,
          ),
        })),

      resetAllPending: () =>
        set((s) => ({
          items: s.items.map((i) =>
            i.status === 'failed' || i.status === 'skipped' || i.status === 'sending'
              ? { ...i, status: 'pending' as const, error: undefined }
              : i,
          ),
        })),

      clearQueue: () =>
        set({
          items: [],
          running: false,
          paused: false,
          lastBatchCount: 0,
        }),

      clearLogs: () => set({ logs: [] }),

      addLog: (level, message, itemId) =>
        set((s) => ({
          logs: [
            {
              id: createId('log'),
              at: new Date().toISOString(),
              level,
              // Nunca persistir CPF/secrets no log
              message: sanitizeLogLine(message),
              itemId,
            },
            ...s.logs,
          ].slice(0, 200),
        })),

      bumpSentToday: () =>
        set((s) => {
          const base = ensureSentToday(s)
          return {
            ...base,
            sentToday: (base.sentToday ?? s.sentToday) + 1,
            sentTodayDate: todayKey(),
          }
        }),

      bumpBatch: () => set((s) => ({ lastBatchCount: s.lastBatchCount + 1 })),
      resetBatch: () => set({ lastBatchCount: 0 }),

      claimNextPending: () => {
        const s = get()
        // ONLY pending — never auto-retry failed (adversarial rule)
        const next = s.items.find((i) => i.status === 'pending')
        if (!next) return null
        set({
          items: s.items.map((i) =>
            i.id === next.id
              ? {
                  ...i,
                  status: 'sending' as const,
                  attempts: i.attempts + 1,
                }
              : i,
          ),
        })
        return { ...next, status: 'sending', attempts: next.attempts + 1 }
      },
    }),
    {
      name: 'lista-zap-queue',
      partialize: (s) => ({
        items: s.items.map((i) => {
          const base =
            i.status === 'sending' ? { ...i, status: 'pending' as const } : { ...i }
          // nunca persistir corpo completo da mensagem
          const { messageText: _mt, ...rest } = base
          return rest
        }),
        running: false,
        paused: false,
        logs: s.logs.slice(0, 50),
        sentToday: s.sentToday,
        sentTodayDate: s.sentTodayDate,
        lastBatchCount: 0,
      }),
      merge: (persisted, current) => {
        const parsed = safeParsePersist(
          QueuePersistSchema,
          persisted ?? {},
          {
            items: [],
            logs: [],
            sentToday: 0,
          },
        )
        return {
          ...current,
          items: parsed.items.map((i) => ({
            ...i,
            status: i.status === 'sending' ? ('pending' as const) : i.status,
            name: sanitizePersonName(i.name) || i.name,
            messagePreview: i.messagePreview
              ? safeMessagePreview(i.messagePreview)
              : undefined,
            error: i.error ? sanitizeLogLine(i.error) : undefined,
          })),
          logs: (parsed.logs ?? []).map((l) => ({
            ...l,
            message: sanitizeLogLine(l.message),
          })),
          running: false,
          paused: false,
          sentToday: parsed.sentToday ?? 0,
          sentTodayDate: parsed.sentTodayDate ?? current.sentTodayDate,
          lastBatchCount: 0,
        }
      },
    },
  ),
)

export function queueStats(items: QueueItem[]) {
  return {
    pending: items.filter((i) => i.status === 'pending').length,
    sending: items.filter((i) => i.status === 'sending').length,
    sent: items.filter((i) => i.status === 'sent').length,
    failed: items.filter((i) => i.status === 'failed').length,
    skipped: items.filter((i) => i.status === 'skipped').length,
    total: items.length,
  }
}
