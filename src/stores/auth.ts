import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createSalt,
  hashPin,
  verifyPin,
} from '@/lib/security'
import { hardWipeAllData } from '@/lib/wipe'
import { stopQueueWorker } from '@/lib/queue-worker'

const SESSION_KEY = 'lista-zap-unlocked'
const MIN_PIN = 6
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 60_000

function readSessionUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function writeSessionUnlocked(v: boolean) {
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, '1')
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* private mode */
  }
}

interface AuthState {
  lockEnabled: boolean
  pinSalt: string
  pinHash: string
  displayName: string
  unlocked: boolean
  hydrated: boolean
  failedAttempts: number
  lockoutUntil: number

  setDisplayName: (name: string) => void
  setupPin: (pin: string, displayName?: string) => Promise<void>
  unlock: (pin: string) => Promise<{ ok: boolean; error?: string }>
  lock: () => void
  disableLock: (pin: string) => Promise<boolean>
  /** Wipe completo. Exige PIN se lock ativo (H1). Nunca desativa lock sem wipe de auth. */
  wipeAllData: (pin?: string) => Promise<{ ok: boolean; error?: string }>
  setHydrated: (v: boolean) => void
  syncSession: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      lockEnabled: false,
      pinSalt: '',
      pinHash: '',
      displayName: '',
      unlocked: true,
      hydrated: false,
      failedAttempts: 0,
      lockoutUntil: 0,

      setDisplayName: (name) => set({ displayName: name.trim() }),

      setupPin: async (pin, displayName) => {
        const clean = pin.replace(/\s/g, '')
        if (clean.length < MIN_PIN) {
          throw new Error(`PIN deve ter pelo menos ${MIN_PIN} dígitos/caracteres`)
        }
        const salt = createSalt()
        const hash = await hashPin(clean, salt)
        writeSessionUnlocked(true)
        set({
          lockEnabled: true,
          pinSalt: salt,
          pinHash: hash,
          unlocked: true,
          failedAttempts: 0,
          lockoutUntil: 0,
          displayName:
            displayName?.trim() || get().displayName || 'Vendedor',
        })
      },

      unlock: async (pin) => {
        const { pinSalt, pinHash, lockEnabled, lockoutUntil, failedAttempts } =
          get()
        if (!lockEnabled) {
          writeSessionUnlocked(true)
          set({ unlocked: true })
          return { ok: true }
        }
        if (Date.now() < lockoutUntil) {
          const sec = Math.ceil((lockoutUntil - Date.now()) / 1000)
          return { ok: false, error: `Aguarde ${sec}s (muitas tentativas)` }
        }
        const ok = await verifyPin(pin.replace(/\s/g, ''), pinSalt, pinHash)
        if (ok) {
          writeSessionUnlocked(true)
          set({ unlocked: true, failedAttempts: 0, lockoutUntil: 0 })
          return { ok: true }
        }
        const next = failedAttempts + 1
        if (next >= MAX_ATTEMPTS) {
          set({
            failedAttempts: next,
            lockoutUntil: Date.now() + LOCKOUT_MS,
          })
          return {
            ok: false,
            error: `PIN incorreto. Bloqueado por ${LOCKOUT_MS / 1000}s`,
          }
        }
        set({ failedAttempts: next })
        return {
          ok: false,
          error: `PIN incorreto (${next}/${MAX_ATTEMPTS})`,
        }
      },

      lock: () => {
        // M1: parar worker ao bloquear
        try {
          stopQueueWorker()
        } catch {
          /* ignore */
        }
        writeSessionUnlocked(false)
        set({ unlocked: false })
      },

      disableLock: async (pin) => {
        const { pinSalt, pinHash, lockEnabled } = get()
        if (!lockEnabled) return true
        const ok = await verifyPin(pin.replace(/\s/g, ''), pinSalt, pinHash)
        if (!ok) return false
        writeSessionUnlocked(true)
        set({
          lockEnabled: false,
          pinSalt: '',
          pinHash: '',
          unlocked: true,
          failedAttempts: 0,
          lockoutUntil: 0,
        })
        return true
      },

      wipeAllData: async (pin) => {
        const { lockEnabled, pinSalt, pinHash, unlocked } = get()

        // H1: se lock ativo, exige PIN (mesmo na tela bloqueada)
        if (lockEnabled) {
          if (!pin) {
            return { ok: false, error: 'Informe o PIN para apagar os dados' }
          }
          const ok = await verifyPin(pin.replace(/\s/g, ''), pinSalt, pinHash)
          if (!ok) {
            return { ok: false, error: 'PIN incorreto — wipe cancelado' }
          }
        }

        await hardWipeAllData({ clearAuth: true })
        writeSessionUnlocked(true)
        set({
          lockEnabled: false,
          pinSalt: '',
          pinHash: '',
          displayName: '',
          unlocked: true,
          failedAttempts: 0,
          lockoutUntil: 0,
        })
        // se estava bloqueado e wipe ok, unlocked true para recarregar limpo
        void unlocked
        return { ok: true }
      },

      setHydrated: (v) => set({ hydrated: v }),

      syncSession: () => {
        const { lockEnabled } = get()
        if (!lockEnabled) {
          set({ unlocked: true })
          return
        }
        set({ unlocked: readSessionUnlocked() })
      },
    }),
    {
      name: 'lista-zap-auth',
      partialize: (s) => ({
        lockEnabled: s.lockEnabled,
        pinSalt: s.pinSalt,
        pinHash: s.pinHash,
        displayName: s.displayName,
        failedAttempts: s.failedAttempts,
        lockoutUntil: s.lockoutUntil,
      }),
      onRehydrateStorage: () => (state) => {
        state?.syncSession()
        state?.setHydrated(true)
      },
    },
  ),
)
