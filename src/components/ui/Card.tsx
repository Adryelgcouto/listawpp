import type { CSSProperties, ReactNode } from 'react'

export function Card({
  children,
  className = '',
  style,
  padded = true,
  tone = 'default',
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  padded?: boolean
  tone?: 'default' | 'elevated' | 'accent' | 'warn' | 'danger'
}) {
  const tones: Record<string, CSSProperties> = {
    default: {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
    },
    elevated: {
      background: 'var(--color-surface-2)',
      border: '1px solid var(--color-border-strong)',
    },
    accent: {
      background: 'var(--color-accent-soft)',
      border: '1px solid color-mix(in oklab, var(--color-accent) 28%, transparent)',
    },
    warn: {
      background: 'var(--color-warn-soft)',
      border: '1px solid color-mix(in oklab, var(--color-warn) 30%, transparent)',
    },
    danger: {
      background: 'var(--color-danger-soft)',
      border: '1px solid color-mix(in oklab, var(--color-danger) 30%, transparent)',
    },
  }

  return (
    <div
      className={className}
      style={{
        ...tones[tone],
        borderRadius: 'var(--radius-lg)',
        padding: padded ? '14px 14px' : 0,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
