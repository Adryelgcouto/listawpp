import type { ReactNode } from 'react'
import { useHydrated } from '@/hooks/useHydrated'

export function HydrationGate({ children }: { children: ReactNode }) {
  const hydrated = useHydrated()

  if (!hydrated) {
    return (
      <div
        className="app-shell"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          padding: 24,
          paddingTop: 48,
          gap: 12,
        }}
      >
        <div className="skeleton" style={{ height: 28, width: 140 }} />
        <div className="skeleton" style={{ height: 18, width: 220 }} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginTop: 8,
          }}
        >
          <div className="skeleton" style={{ height: 88 }} />
          <div className="skeleton" style={{ height: 88 }} />
          <div className="skeleton" style={{ height: 88 }} />
          <div className="skeleton" style={{ height: 88 }} />
        </div>
        <div className="skeleton" style={{ height: 120, marginTop: 8 }} />
        <div
          style={{
            marginTop: 'auto',
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--color-text-faint)',
          }}
        >
          Carregando Lista Zap…
        </div>
      </div>
    )
  }

  return children
}
