import type { ReactNode } from 'react'
import { BottomNav } from './BottomNav'
import { LoginBar } from './LoginBar'
import { CreatedWithGrokBanner } from '@/components/CreatedWithGrokBanner'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell" style={{ paddingTop: 'var(--banner-h)' }}>
      <CreatedWithGrokBanner />
      <main className="app-main">
        <LoginBar />
        {children}
      </main>
      <BottomNav />
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  right,
  eyebrow = 'Lista Zap',
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  eyebrow?: string
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 18,
        paddingTop: 2,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {eyebrow}
        </div>
        <h1 className="display-title" style={{ margin: 0, fontSize: 30 }}>
          {title}
        </h1>
        {subtitle ? (
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 14,
              color: 'var(--color-text-muted)',
              lineHeight: 1.4,
              textWrap: 'pretty',
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {right}
    </header>
  )
}
