/**
 * C2 / H1 / M1 — wipe real: para worker, zera memória dos stores, limpa storage.
 */
import { DEFAULT_SETTINGS } from '@/types'
import { wipeLocalStorageKeys, clearRuntimeSecrets } from './security'
import { clearCommercialImage } from './image-store'

type StopFn = () => void

let stopWorker: StopFn | null = null

export function registerWipeStopWorker(fn: StopFn) {
  stopWorker = fn
}

export async function hardWipeAllData(opts?: {
  /** Se true, também zera PIN (só após auth). Default true se wipe completo. */
  clearAuth?: boolean
}): Promise<void> {
  const clearAuth = opts?.clearAuth !== false

  try {
    stopWorker?.()
  } catch {
    /* ignore */
  }

  // Lazy imports evitam ciclos
  const { useClientsStore } = await import('@/stores/clients')
  const { useQueueStore } = await import('@/stores/queue')
  const { useSettingsStore } = await import('@/stores/settings')
  const { useAuthStore } = await import('@/stores/auth')

  // Zera memória ANTES de limpar storage (C2)
  useClientsStore.setState({ clients: [] })
  useQueueStore.setState({
    items: [],
    running: false,
    paused: false,
    logs: [],
    sentToday: 0,
    sentTodayDate: new Date().toISOString().slice(0, 10),
    lastBatchCount: 0,
  })
  // merge mantém actions do store
  useSettingsStore.setState({ ...DEFAULT_SETTINGS })

  try {
    useClientsStore.persist.clearStorage()
    useQueueStore.persist.clearStorage()
    useSettingsStore.persist.clearStorage()
    if (clearAuth) useAuthStore.persist.clearStorage()
  } catch {
    /* ignore */
  }

  wipeLocalStorageKeys()
  clearRuntimeSecrets()
  await clearCommercialImage()

  if (clearAuth) {
    useAuthStore.setState({
      lockEnabled: false,
      pinSalt: '',
      pinHash: '',
      displayName: '',
      unlocked: true,
      failedAttempts: 0,
      lockoutUntil: 0,
    })
  }
}
