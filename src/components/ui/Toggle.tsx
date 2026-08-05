export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      className="tap"
      onClick={() => onChange(!checked)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 0',
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        minHeight: 52,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
          }}
        >
          {label}
        </span>
        {description ? (
          <span
            style={{
              display: 'block',
              fontSize: 12.5,
              color: 'var(--color-text-muted)',
              marginTop: 2,
              lineHeight: 1.35,
            }}
          >
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        style={{
          width: 50,
          height: 30,
          borderRadius: 999,
          flexShrink: 0,
          background: checked ? 'var(--color-accent)' : 'var(--color-surface-3)',
          border: `1px solid ${checked ? 'var(--color-accent-dim)' : 'var(--color-border-strong)'}`,
          position: 'relative',
          transition: 'background-color 180ms ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 22 : 2,
            width: 24,
            height: 24,
            borderRadius: 999,
            background: checked ? 'var(--color-accent-ink)' : 'var(--color-text-muted)',
            transition: 'left 180ms ease, background-color 180ms ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
          }}
        />
      </span>
    </button>
  )
}
