import type {
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'

const base: CSSProperties = {
  width: '100%',
  minHeight: 46,
  padding: '11px 13px',
  background: 'var(--color-bg-elevated)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  color: 'var(--color-text)',
  outline: 'none',
  transitionProperty: 'border-color, box-shadow',
  transitionDuration: '150ms',
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { style, className = '', ...rest } = props
  return (
    <input
      {...rest}
      className={`field ${className}`}
      style={{ ...base, ...style }}
    />
  )
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { style, className = '', ...rest } = props
  return (
    <textarea
      {...rest}
      className={`field ${className}`}
      style={{
        ...base,
        minHeight: 104,
        resize: 'vertical',
        lineHeight: 1.5,
        ...style,
      }}
    />
  )
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.1em',
        color: 'var(--color-text-faint)',
        marginBottom: 7,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </label>
  )
}
