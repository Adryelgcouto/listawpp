export function CreatedWithGrokBanner() {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-1.5"
      style={{
        height: 'var(--banner-h)',
        background: 'rgba(9, 9, 11, 0.92)',
        borderBottom: '1px solid var(--color-border)',
        color: 'var(--color-text-faint)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
    >
      <span>Built with</span>
      <span style={{ color: 'var(--color-text)' }}>Grok</span>
      <span style={{ color: 'var(--color-accent)' }}>·</span>
      <span>xAI</span>
    </div>
  )
}
