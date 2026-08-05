import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useQueueStore } from '@/stores/queue'
import { useSettingsStore } from '@/stores/settings'

/** Gate UI until all zustand persist stores finished rehydration (avoid mismatch). */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stores = [
      useSettingsStore,
      useClientsStore,
      useQueueStore,
      useAuthStore,
    ] as const

    const check = () => {
      if (stores.every((s) => s.persist.hasHydrated())) {
        useAuthStore.getState().syncSession()
        setHydrated(true)
        return true
      }
      return false
    }

    if (check()) return

    const unsubs = stores.map((s) =>
      s.persist.onFinishHydration(() => {
        check()
      }),
    )

    const t = window.setTimeout(() => {
      useAuthStore.getState().syncSession()
      setHydrated(true)
    }, 800)

    return () => {
      unsubs.forEach((u) => u?.())
      window.clearTimeout(t)
    }
  }, [])

  return hydrated
}
