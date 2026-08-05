import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, KeyRound, Lock, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CreatedWithGrokBanner } from '@/components/CreatedWithGrokBanner'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Label } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/auth'

/**
 * Login / bloqueio local com PIN (mín. 6, backoff, wipe com PIN).
 */
export function LoginScreen() {
  const navigate = useNavigate()
  const lockEnabled = useAuthStore((s) => s.lockEnabled)
  const unlocked = useAuthStore((s) => s.unlocked)
  const displayName = useAuthStore((s) => s.displayName)
  const setupPin = useAuthStore((s) => s.setupPin)
  const unlock = useAuthStore((s) => s.unlock)
  const disableLock = useAuthStore((s) => s.disableLock)
  const wipeAllData = useAuthStore((s) => s.wipeAllData)

  const [name, setName] = useState(displayName || '')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [wipePin, setWipePin] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [mode, setMode] = useState<'unlock' | 'setup' | 'disable'>(
    lockEnabled ? 'unlock' : 'setup',
  )

  const goApp = () => void navigate({ to: '/' })

  const onUnlock = async () => {
    setBusy(true)
    try {
      const res = await unlock(pin)
      if (!res.ok) {
        toast.error(res.error ?? 'PIN incorreto')
        setPin('')
        return
      }
      toast.success('Desbloqueado')
      setPin('')
      goApp()
    } finally {
      setBusy(false)
    }
  }

  const onSetup = async () => {
    if (pin.length < 6) {
      toast.error('PIN com no mínimo 6 caracteres')
      return
    }
    if (pin !== pin2) {
      toast.error('PIN e confirmação não batem')
      return
    }
    setBusy(true)
    try {
      await setupPin(pin, name)
      toast.success('Bloqueio por PIN ativado')
      setPin('')
      setPin2('')
      goApp()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar PIN')
    } finally {
      setBusy(false)
    }
  }

  const onDisable = async () => {
    setBusy(true)
    try {
      const ok = await disableLock(pin)
      if (!ok) {
        toast.error('PIN incorreto')
        return
      }
      toast.success('Bloqueio desativado')
      setPin('')
      setMode('setup')
    } finally {
      setBusy(false)
    }
  }

  const onWipe = async () => {
    if (!confirmWipe) {
      setConfirmWipe(true)
      return
    }
    setBusy(true)
    try {
      const res = await wipeAllData(lockEnabled ? wipePin || pin : undefined)
      if (!res.ok) {
        toast.error(res.error ?? 'Wipe cancelado')
        return
      }
      toast.success('Dados locais apagados de verdade')
      setPin('')
      setPin2('')
      setWipePin('')
      setName('')
      setConfirmWipe(false)
      setMode('setup')
      // reload garante persist limpo (C2)
      window.location.href = '/login'
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="app-shell"
      style={{ paddingTop: 'var(--banner-h)', minHeight: '100dvh' }}
    >
      <CreatedWithGrokBanner />
      <div style={{ padding: '20px 16px 40px', maxWidth: 420, margin: '0 auto' }}>
        {unlocked || !lockEnabled ? (
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--color-text-muted)',
              textDecoration: 'none',
              fontSize: 13,
              minHeight: 44,
              marginBottom: 8,
            }}
          >
            <ArrowLeft size={16} />
            Voltar ao app
          </Link>
        ) : null}

        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Sessão local
        </div>
        <h1 className="display-title" style={{ margin: '0 0 8px', fontSize: 30 }}>
          {lockEnabled && !unlocked ? 'Desbloquear' : 'Login'}
        </h1>
        <p
          style={{
            margin: '0 0 18px',
            fontSize: 14,
            color: 'var(--color-text-muted)',
            lineHeight: 1.5,
          }}
        >
          PIN trava a interface nesta aba (sessionStorage). Dados de clientes e
          chaves ficam no storage do browser — em aparelho compartilhado use PIN
          e wipe com confirmação. Gemini (se ligado) envia imagens/nomes ao Google.
        </p>

        <Card style={{ marginBottom: 12, padding: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 14,
              color: 'var(--color-accent)',
            }}
          >
            <Lock size={18} />
            <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>
              {mode === 'unlock'
                ? 'Entrar com PIN'
                : mode === 'disable'
                  ? 'Remover PIN'
                  : 'Criar PIN (mín. 6)'}
            </span>
          </div>

          {mode === 'setup' ? (
            <>
              <Label>Seu nome (opcional)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como aparece na barra"
                style={{ marginBottom: 10 }}
                autoComplete="nickname"
              />
              <Label>PIN (mín. 6)</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                style={{ marginBottom: 10 }}
                autoComplete="new-password"
              />
              <Label>Confirmar PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={pin2}
                onChange={(e) => setPin2(e.target.value)}
                placeholder="••••••"
                style={{ marginBottom: 14 }}
                autoComplete="new-password"
              />
              <Button
                full
                icon={<ShieldCheck size={16} />}
                disabled={busy}
                onClick={() => void onSetup()}
              >
                Ativar bloqueio
              </Button>
            </>
          ) : null}

          {mode === 'unlock' ? (
            <>
              <Label>PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                style={{ marginBottom: 14 }}
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onUnlock()
                }}
              />
              <Button
                full
                icon={<KeyRound size={16} />}
                disabled={busy || !pin}
                onClick={() => void onUnlock()}
              >
                Desbloquear
              </Button>
            </>
          ) : null}

          {mode === 'disable' ? (
            <>
              <Label>PIN atual</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                style={{ marginBottom: 14 }}
                autoComplete="current-password"
              />
              <Button
                full
                variant="warn"
                disabled={busy}
                onClick={() => void onDisable()}
              >
                Desativar PIN
              </Button>
            </>
          ) : null}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lockEnabled && unlocked ? (
            <Button
              variant="secondary"
              full
              onClick={() => {
                setMode('disable')
                setPin('')
              }}
            >
              Desativar bloqueio…
            </Button>
          ) : null}

          {confirmWipe && lockEnabled ? (
            <Card tone="danger" style={{ padding: 12 }}>
              <Label>PIN para confirmar wipe</Label>
              <Input
                type="password"
                value={wipePin}
                onChange={(e) => setWipePin(e.target.value)}
                placeholder="PIN obrigatório"
                style={{ marginBottom: 8 }}
              />
            </Card>
          ) : null}

          <Button
            variant="danger"
            full
            icon={<Trash2 size={15} />}
            disabled={busy}
            onClick={() => void onWipe()}
          >
            {confirmWipe
              ? lockEnabled
                ? 'Confirmar apagar (com PIN)'
                : 'Confirmar apagar tudo'
              : 'Apagar todos os dados locais'}
          </Button>
          {confirmWipe ? (
            <Button
              variant="ghost"
              full
              onClick={() => {
                setConfirmWipe(false)
                setWipePin('')
              }}
            >
              Cancelar wipe
            </Button>
          ) : null}
        </div>

        <p
          style={{
            marginTop: 16,
            fontSize: 12,
            color: 'var(--color-text-faint)',
            lineHeight: 1.45,
          }}
        >
          Segurança: CPF nunca no WhatsApp. Logs mascaram telefone/nome. API keys
          redigidas em erros. Wipe zera memória + storage + recarrega.
        </p>
      </div>
    </div>
  )
}
