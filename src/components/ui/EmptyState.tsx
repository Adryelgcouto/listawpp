import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '40px 22px',
        gap: 10,
        color: 'var(--color-text-muted)',
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 18,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--color-accent-soft)',
          border: '1px solid color-mix(in oklab, var(--color-accent) 25%, transparent)',
          color: 'var(--color-accent)',
          marginBottom: 4,
        }}
      >
        {icon}
      </div>
      <div
        className="display-title"
        style={{
          fontSize: 18,
          color: 'var(--color-text)',
        }}
      >
        {title}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 13.5,
          lineHeight: 1.5,
          maxWidth: 280,
          textWrap: 'pretty',
        }}
      >
        {description}
      </p>
      {action ? <div style={{ marginTop: 10 }}>{action}</div> : null}
    </div>
  )
}
