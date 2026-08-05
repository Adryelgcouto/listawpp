import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth'

/** M7: se PIN ativo e sessão bloqueada, força /login. Timeout se storage falhar. */
export function AuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const lockEnabled = useAuthStore((s) => s.lockEnabled)
  const unlocked = useAuthStore((s) => s.unlocked)
  const hydrated = useAuthStore((s) => s.hydrated)
  const setHydrated = useAuthStore((s) => s.setHydrated)
  const syncSession = useAuthStore((s) => s.syncSession)
  const [storageError, setStorageError] = useState(false)

  useEffect(() => {
    try {
      const t = `__lz_${Date.now()}`
      localStorage.setItem(t, '1')
      localStorage.removeItem(t)
    } catch {
      setStorageError(true)
    }
    syncSession()
    // fallback se onRehydrateStorage nunca rodar
    const t = window.setTimeout(() => {
      if (!useAuthStore.getState().hydrated) {
        useAuthStore.getState().syncSession()
        setHydrated(true)
      }
    }, 900)
    return () => window.clearTimeout(t)
  }, [syncSession, setHydrated])

  useEffect(() => {
    if (!hydrated) return
    if (pathname === '/login') return
    if (lockEnabled && !unlocked) {
      void navigate({ to: '/login' })
    }
  }, [hydrated, lockEnabled, unlocked, pathname, navigate])

  if (storageError) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#09090b',
          color: '#f4f4f5',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Storage bloqueado</h1>
          <p style={{ color: '#a1a1aa', fontSize: 14, maxWidth: 320 }}>
            O browser bloqueou localStorage/sessionStorage. Lista Zap precisa
            deles para funcionar. Libere o storage neste site e recarregue.
          </p>
        </div>
      </div>
    )
  }

  if (!hydrated) return null

  if (lockEnabled && !unlocked && pathname !== '/login') {
    return null
  }

  return children
}
