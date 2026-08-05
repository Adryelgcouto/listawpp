import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warn' | 'wa'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  full?: boolean
}

const styles: Record<Variant, CSSProperties> = {
  primary: {
    background: 'var(--color-accent)',
    color: 'var(--color-accent-ink)',
    border: '1px solid color-mix(in oklab, var(--color-accent) 70%, white)',
    fontWeight: 700,
    boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset, 0 8px 20px rgba(214,255,75,0.12)',
  },
  secondary: {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border-strong)',
    fontWeight: 600,
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-muted)',
    border: '1px solid transparent',
    fontWeight: 600,
  },
  danger: {
    background: 'var(--color-danger-soft)',
    color: 'var(--color-danger)',
    border: '1px solid color-mix(in oklab, var(--color-danger) 28%, transparent)',
    fontWeight: 600,
  },
  warn: {
    background: 'var(--color-warn-soft)',
    color: 'var(--color-warn)',
    border: '1px solid color-mix(in oklab, var(--color-warn) 28%, transparent)',
    fontWeight: 600,
  },
  wa: {
    background: 'var(--color-wa)',
    color: '#04140b',
    border: '1px solid color-mix(in oklab, var(--color-wa) 60%, white)',
    fontWeight: 700,
  },
}

const sizes: Record<Size, CSSProperties> = {
  sm: {
    minHeight: 36,
    padding: '0 12px',
    fontSize: 13,
    borderRadius: 10,
    gap: 6,
  },
  md: {
    minHeight: 46,
    padding: '0 16px',
    fontSize: 14,
    borderRadius: 12,
    gap: 8,
  },
  lg: {
    minHeight: 52,
    padding: '0 18px',
    fontSize: 15,
    borderRadius: 14,
    gap: 8,
  },
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  full,
  children,
  style,
  disabled,
  className = '',
  ...rest
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`tap inline-flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none ${className}`}
      style={{
        ...styles[variant],
        ...sizes[size],
        width: full ? '100%' : undefined,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        whiteSpace: 'nowrap',
        transitionProperty: 'transform, opacity, background-color, box-shadow',
        transitionDuration: '140ms',
        transitionTimingFunction: 'ease-out',
        ...style,
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.97)'
        rest.onMouseDown?.(e)
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
        rest.onMouseUp?.(e)
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
        rest.onMouseLeave?.(e)
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
