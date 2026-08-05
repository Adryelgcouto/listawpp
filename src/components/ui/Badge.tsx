import type { ReactNode } from 'react'

const tones = {
  neutral: {
    bg: 'var(--color-surface-2)',
    color: 'var(--color-text-muted)',
    border: 'var(--color-border)',
  },
  success: {
    bg: 'var(--color-wa-soft)',
    color: 'var(--color-wa)',
    border: 'color-mix(in oklab, var(--color-wa) 30%, transparent)',
  },
  accent: {
    bg: 'var(--color-accent-soft)',
    color: 'var(--color-accent)',
    border: 'color-mix(in oklab, var(--color-accent) 35%, transparent)',
  },
  warn: {
    bg: 'var(--color-warn-soft)',
    color: 'var(--color-warn)',
    border: 'color-mix(in oklab, var(--color-warn) 30%, transparent)',
  },
  danger: {
    bg: 'var(--color-danger-soft)',
    color: 'var(--color-danger)',
    border: 'color-mix(in oklab, var(--color-danger) 30%, transparent)',
  },
  info: {
    bg: 'var(--color-info-soft)',
    color: 'var(--color-info)',
    border: 'color-mix(in oklab, var(--color-info) 30%, transparent)',
  },
} as const

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof tones
  children: ReactNode
}) {
  const t = tones[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 9px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
        textTransform: 'uppercase',
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  )
}
