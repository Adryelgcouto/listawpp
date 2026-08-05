import type { CSSProperties } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Lock, LogIn, LogOut, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth'

/** Barra de sessão no topo do app — login / lock / perfil local. */
export function LoginBar() {
  const navigate = useNavigate()
  const lockEnabled = useAuthStore((s) => s.lockEnabled)
  const unlocked = useAuthStore((s) => s.unlocked)
  const displayName = useAuthStore((s) => s.displayName)
  const lock = useAuthStore((s) => s.lock)

  const label = displayName || (lockEnabled ? 'Protegido' : 'Sem bloqueio')

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 12,
        padding: '8px 10px',
        borderRadius: 14,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        minHeight: 48,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            background: lockEnabled
              ? 'var(--color-accent-soft)'
              : 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            color: lockEnabled ? 'var(--color-accent)' : 'var(--color-text-muted)',
            flexShrink: 0,
          }}
        >
          {lockEnabled ? <Lock size={15} /> : <UserRound size={15} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
            {lockEnabled
              ? unlocked
                ? 'Sessão desbloqueada nesta aba'
                : 'Bloqueado'
              : 'PIN opcional · dados só neste aparelho'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {lockEnabled && unlocked ? (
          <button
            type="button"
            className="tap"
            aria-label="Bloquear app"
            onClick={() => {
              lock()
              toast.message('App bloqueado')
              void navigate({ to: '/login' })
            }}
            style={chipStyle}
          >
            <LogOut size={14} />
            Sair
          </button>
        ) : (
          <Link
            to="/login"
            className="tap"
            style={{ ...chipStyle, textDecoration: 'none' }}
          >
            <LogIn size={14} />
            {lockEnabled ? 'Entrar' : 'Login'}
          </Link>
        )}
      </div>
    </div>
  )
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 36,
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid var(--color-border-strong)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text)',
  fontSize: 12,
  fontWeight: 600,
}
