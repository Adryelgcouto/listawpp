import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Client, ContactStatus, ExtractedRow } from '@/types'
import { createId } from '@/lib/id'
import { isValidBrPhone, normalizePhone } from '@/lib/phone'
import { normalizeCpf } from '@/lib/cpf'
import { sanitizePersonName } from '@/lib/security'
import { ClientsPersistSchema, safeParsePersist } from '@/lib/schemas'

interface ClientsState {
  clients: Client[]
  upsertFromRows: (rows: ExtractedRow[]) => Client[]
  addManual: (input: {
    name: string
    phone: string
    cpf?: string
    notes?: string
  }) => Client
  updateClient: (id: string, patch: Partial<Client>) => void
  deleteClient: (id: string) => void
  setContactStatus: (id: string, status: ContactStatus) => void
  markValidatedByPhone: (phone: string) => void
  markFailedByPhone: (phone: string) => void
  search: (q: string) => Client[]
  resetClients: () => void
}

function nowIso() {
  return new Date().toISOString()
}

export const useClientsStore = create<ClientsState>()(
  persist(
    (set, get) => ({
      clients: [],

      upsertFromRows: (rows) => {
        const merged: Client[] = []
        const stamp = nowIso()
        set((state) => {
          const map = new Map(state.clients.map((c) => [c.phone, c]))
          for (const row of rows) {
            if (!row.selected) continue
            const phone = normalizePhone(row.telefone)
            // H6: só enfileira telefone BR válido
            if (!phone || !isValidBrPhone(phone)) continue
            const name =
              sanitizePersonName(row.nome) || 'Sem nome'
            const existing = map.get(phone)
            if (existing) {
              const updated: Client = {
                ...existing,
                name: name || existing.name,
                cpf: normalizeCpf(row.cpf) || existing.cpf,
                updatedAt: stamp,
              }
              map.set(phone, updated)
              merged.push(updated)
            } else {
              const created: Client = {
                id: createId('cli'),
                name,
                phone,
                cpf: normalizeCpf(row.cpf),
                contactStatus: 'unknown',
                notes: '',
                createdAt: stamp,
                updatedAt: stamp,
              }
              map.set(phone, created)
              merged.push(created)
            }
          }
          return { clients: Array.from(map.values()).sort(byName) }
        })
        return merged
      },

      addManual: (input) => {
        const phone = normalizePhone(input.phone)
        if (!isValidBrPhone(phone)) {
          throw new Error('Telefone BR inválido (DDD + número)')
        }
        const stamp = nowIso()
        let created: Client = {
          id: createId('cli'),
          name: sanitizePersonName(input.name) || 'Sem nome',
          phone,
          cpf: normalizeCpf(input.cpf ?? ''),
          contactStatus: 'unknown',
          notes: input.notes?.trim() ?? '',
          createdAt: stamp,
          updatedAt: stamp,
        }

        set((state) => {
          const existing = state.clients.find((c) => c.phone === phone)
          if (existing) {
            created = {
              ...existing,
              name: created.name || existing.name,
              cpf: created.cpf || existing.cpf,
              notes: created.notes || existing.notes,
              updatedAt: stamp,
            }
            return {
              clients: state.clients
                .map((c) => (c.id === existing.id ? created : c))
                .sort(byName),
            }
          }
          return { clients: [...state.clients, created].sort(byName) }
        })
        return created
      },

      updateClient: (id, patch) =>
        set((state) => ({
          clients: state.clients
            .map((c) => {
              if (c.id !== id) return c
              const phone = patch.phone
                ? normalizePhone(patch.phone)
                : c.phone
              if (patch.phone && !isValidBrPhone(phone)) return c
              return {
                ...c,
                ...patch,
                name:
                  patch.name !== undefined
                    ? sanitizePersonName(patch.name) || c.name
                    : c.name,
                phone,
                cpf:
                  patch.cpf !== undefined ? normalizeCpf(patch.cpf) : c.cpf,
                updatedAt: nowIso(),
              }
            })
            .sort(byName),
        })),

      deleteClient: (id) =>
        set((state) => ({
          clients: state.clients.filter((c) => c.id !== id),
        })),

      setContactStatus: (id, status) =>
        set((state) => ({
          clients: state.clients.map((c) =>
            c.id === id
              ? {
                  ...c,
                  contactStatus: status,
                  lastContactAt:
                    status === 'validated' ? nowIso() : c.lastContactAt,
                  updatedAt: nowIso(),
                }
              : c,
          ),
        })),

      markValidatedByPhone: (phone) => {
        const n = normalizePhone(phone)
        set((state) => ({
          clients: state.clients.map((c) =>
            c.phone === n
              ? {
                  ...c,
                  contactStatus: 'validated',
                  lastContactAt: nowIso(),
                  updatedAt: nowIso(),
                }
              : c,
          ),
        }))
      },

      markFailedByPhone: (phone) => {
        const n = normalizePhone(phone)
        set((state) => ({
          clients: state.clients.map((c) =>
            c.phone === n
              ? { ...c, contactStatus: 'failed', updatedAt: nowIso() }
              : c,
          ),
        }))
      },

      search: (q) => {
        const query = q.trim().toLowerCase()
        const digits = q.replace(/\D/g, '')
        const list = get().clients
        if (!query) return list
        return list.filter((c) => {
          if (c.name.toLowerCase().includes(query)) return true
          if (c.phone.includes(digits) && digits.length >= 3) return true
          if (c.cpf && digits.length >= 3 && c.cpf.includes(digits)) return true
          if (c.notes.toLowerCase().includes(query)) return true
          return false
        })
      },

      resetClients: () => set({ clients: [] }),
    }),
    {
      name: 'lista-zap-clients',
      partialize: (s) => ({ clients: s.clients }),
      merge: (persisted, current) => {
        const raw =
          persisted && typeof persisted === 'object'
            ? persisted
            : { clients: [] }
        const parsed = safeParsePersist(
          ClientsPersistSchema,
          raw,
          { clients: [] },
        )
        return {
          ...current,
          clients: parsed.clients.map((c) => ({
            ...c,
            name: sanitizePersonName(c.name) || c.name,
          })),
        }
      },
    },
  ),
)

function byName(a: Client, b: Client) {
  return a.name.localeCompare(b.name, 'pt-BR')
}
