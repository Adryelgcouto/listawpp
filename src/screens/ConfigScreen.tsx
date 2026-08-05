import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronUp,
  KeyRound,
  Link2,
  QrCode,
  RefreshCw,
  Shield,
  Smartphone,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Label } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import {
  ANTI_BAN_PRESETS,
  formatDuration,
  type AntiBanPreset,
} from '@/lib/anti-ban'
import {
  ensureInstance,
  fetchQrCode,
  getConnectionState,
} from '@/lib/evolution'
import { isSafeEvolutionUrl } from '@/lib/security'
import {
  hasServerWaApi,
  serverWaQr,
  serverWaStatus,
} from '@/lib/wa-server'
import { useSettingsStore } from '@/stores/settings'
import type { WaConnectionStatus } from '@/types'

const MAX_QR_POLLS = 20
const POLL_MS = 3000

function missingSetupMessage(s: {
  evolutionUrl: string
  evolutionApiKey: string
  evolutionInstance: string
}): string | null {
  if (!s.evolutionUrl.trim()) {
    return 'Falta a URL da Evolution (padrão VSB: https://wpp.viversemprebemvsb.com).'
  }
  if (!s.evolutionApiKey.trim()) {
    return 'Cole a chave master da Evolution do VSB (a mesma AUTHENTICATION_API_KEY / EVOLUTION_API_AUTH_KEY do servidor).'
  }
  if (!s.evolutionInstance.trim()) {
    return 'Falta o nome da instância (ex.: lista-zap).'
  }
  if (/localhost|127\.0\.0\.1/i.test(s.evolutionUrl)) {
    return 'Use a Evolution da nuvem VSB (https://wpp.viversemprebemvsb.com), não localhost.'
  }
  const safe = isSafeEvolutionUrl(s.evolutionUrl)
  if (!safe.ok) return safe.reason ?? 'URL inválida'
  return null
}

export function ConfigScreen() {
  const settings = useSettingsStore()
  const [waStatus, setWaStatus] = useState<WaConnectionStatus>('unknown')
  const [waError, setWaError] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const pollTimer = useRef<number | null>(null)
  const pollCountRef = useRef(0)
  const abortRef = useRef(false)

  const stopPolling = useCallback(() => {
    abortRef.current = true
    if (pollTimer.current != null) {
      window.clearTimeout(pollTimer.current)
      pollTimer.current = null
    }
    setPolling(false)
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const refreshStatus = useCallback(async () => {
    if (settings.demoMode) {
      setWaStatus('open')
      setWaError(null)
      return 'open' as WaConnectionStatus
    }
    const missing = missingSetupMessage(settings)
    if (missing) {
      setWaStatus('error')
      setWaError(missing)
      return 'error' as WaConnectionStatus
    }
    const res = await getConnectionState(
      settings.evolutionUrl,
      settings.evolutionApiKey,
      settings.evolutionInstance,
    )
    setWaStatus(res.status)
    setWaError(res.error ?? null)
    return res.status
  }, [
    settings.demoMode,
    settings.evolutionUrl,
    settings.evolutionApiKey,
    settings.evolutionInstance,
  ])

  useEffect(() => {
    if (!settings.demoMode) void refreshStatus()
  }, [refreshStatus, settings.demoMode])

  /** Fluxo principal: um botão. Na Vercel usa /api/wa (chave no servidor). */
  const connectWhatsApp = async () => {
    stopPolling()
    setWaError(null)
    setQrDataUrl(null)
    setPairingCode(null)

    if (settings.demoMode) {
      settings.setSettings({ demoMode: false })
    }

    setPolling(true)
    abortRef.current = false
    pollCountRef.current = 0
    setPollCount(0)
    setWaStatus('connecting')

    const useServer = hasServerWaApi()

    if (!useServer) {
      const miss = missingSetupMessage({
        evolutionUrl: settings.evolutionUrl,
        evolutionApiKey: settings.evolutionApiKey,
        evolutionInstance: settings.evolutionInstance,
      })
      if (miss) {
        stopPolling()
        setShowAdvanced(true)
        setWaError(miss)
        setWaStatus('error')
        toast.error(miss)
        return
      }
      const ensured = await ensureInstance({
        url: settings.evolutionUrl,
        apiKey: settings.evolutionApiKey,
        instance: settings.evolutionInstance,
      })
      if (!ensured.ok) {
        stopPolling()
        setWaStatus('error')
        setWaError(ensured.error ?? 'Falha na instância')
        return
      }
    }

    const tick = async () => {
      if (abortRef.current) return
      if (pollCountRef.current >= MAX_QR_POLLS) {
        stopPolling()
        setWaError(
          'Ainda não conectou. Toque de novo em “Conectar WhatsApp”.',
        )
        setWaStatus('error')
        return
      }

      pollCountRef.current += 1
      setPollCount(pollCountRef.current)

      try {
        if (useServer) {
          const st = await serverWaStatus()
          const s = String(st.status || '').toLowerCase()
          if (s === 'open' || s === 'connected') {
            setWaStatus('open')
            setQrDataUrl(null)
            setPairingCode(null)
            setWaError(null)
            stopPolling()
            toast.success('WhatsApp conectado!')
            return
          }
          const qr = await serverWaQr()
          if (qr.qr) {
            setQrDataUrl(qr.qr)
            setWaStatus('connecting')
            setWaError(null)
          }
          if (qr.pairingCode) setPairingCode(qr.pairingCode)
          if (!qr.ok && qr.message && !qr.qr) {
            setWaError(qr.message)
          }
        } else {
          const state = await getConnectionState(
            settings.evolutionUrl,
            settings.evolutionApiKey,
            settings.evolutionInstance,
          )
          if (state.status === 'open') {
            setWaStatus('open')
            setQrDataUrl(null)
            setPairingCode(null)
            setWaError(null)
            stopPolling()
            toast.success('WhatsApp conectado!')
            return
          }
          const qr = await fetchQrCode(
            settings.evolutionUrl,
            settings.evolutionApiKey,
            settings.evolutionInstance,
          )
          if (qr.qr) {
            setQrDataUrl(qr.qr)
            setWaStatus('connecting')
            setWaError(null)
          }
          if (qr.pairingCode) setPairingCode(qr.pairingCode)
          if (!qr.qr && !qr.pairingCode && qr.error) setWaError(qr.error)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setWaError(msg)
        setWaStatus('error')
      }

      if (abortRef.current) return
      pollTimer.current = window.setTimeout(() => void tick(), POLL_MS)
    }

    await tick()
  }

  return (
    <div>
      <PageHeader
        title="Ajustes"
        eyebrow="Sistema"
        subtitle="Evolution, Gemini e anti-ban"
      />

      {/* —— Conectar WhatsApp (foco do usuário) —— */}
      <Card style={{ marginBottom: 12, padding: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
            }}
          >
            <Smartphone size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 17,
                letterSpacing: '-0.02em',
              }}
            >
              Conectar WhatsApp
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Escaneie o QR (ou digite o código) no celular
            </div>
          </div>
          <StatusBadge
            status={
              settings.demoMode && !polling && !qrDataUrl
                ? 'unknown'
                : waStatus
            }
          />
        </div>

        <p
          style={{
            margin: '0 0 12px',
            fontSize: 13,
            color: 'var(--color-text-muted)',
            lineHeight: 1.5,
          }}
        >
          Já está ligado na Evolution do VSB. Toque no botão, escaneie o QR no
          WhatsApp. Pronto.
        </p>
        <ol
          style={{
            margin: '0 0 14px',
            paddingLeft: 18,
            fontSize: 13,
            color: 'var(--color-text-muted)',
            lineHeight: 1.5,
          }}
        >
          <li>
            Toque <strong>Conectar WhatsApp</strong>
          </li>
          <li>
            No celular: WhatsApp → Aparelhos conectados → Conectar aparelho
          </li>
          <li>Escaneie o QR → status fica conectado</li>
        </ol>

        {waStatus === 'open' && !settings.demoMode ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: 12,
              borderRadius: 12,
              background: 'var(--color-accent-soft)',
              border:
                '1px solid color-mix(in oklab, var(--color-accent) 30%, transparent)',
              fontSize: 14,
              color: 'var(--color-accent)',
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            <Wifi size={18} />
            WhatsApp conectado — pode enviar pela Fila
          </div>
        ) : null}

        {qrDataUrl && waStatus !== 'open' ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <img
              src={qrDataUrl}
              alt="QR Code WhatsApp"
              style={{
                width: 240,
                height: 240,
                borderRadius: 16,
                background: '#fff',
                padding: 10,
                border: '1px solid var(--color-border)',
              }}
            />
            <div
              style={{
                fontSize: 13,
                color: 'var(--color-text-muted)',
                textAlign: 'center',
              }}
            >
              Escaneie com o WhatsApp
              {polling ? ` · aguardando… (${pollCount}/${MAX_QR_POLLS})` : ''}
            </div>
          </div>
        ) : null}

        {pairingCode && waStatus !== 'open' ? (
          <div
            style={{
              textAlign: 'center',
              marginBottom: 14,
              padding: 14,
              borderRadius: 14,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Código de pareamento
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: 'var(--color-accent)',
              }}
            >
              {pairingCode}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                marginTop: 6,
              }}
            >
              WhatsApp → Aparelhos conectados → Conectar com número de telefone
            </div>
          </div>
        ) : null}

        {waError ? (
          <div
            style={{
              fontSize: 13,
              color: 'var(--color-danger)',
              background: 'var(--color-danger-soft)',
              border:
                '1px solid color-mix(in oklab, var(--color-danger) 30%, transparent)',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 12,
              wordBreak: 'break-word',
              lineHeight: 1.45,
            }}
          >
            {waError}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            icon={<QrCode size={18} />}
            onClick={() => void connectWhatsApp()}
            disabled={polling && waStatus !== 'error'}
            full
          >
            {polling
              ? 'Aguardando você escanear…'
              : waStatus === 'open' && !settings.demoMode
                ? 'Já conectado'
                : 'Conectar WhatsApp'}
          </Button>
        </div>
        {polling ? (
          <Button
            variant="secondary"
            onClick={stopPolling}
            full
            style={{ marginTop: 8 }}
          >
            Cancelar
          </Button>
        ) : null}
        {waStatus === 'open' && !settings.demoMode ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={() => void refreshStatus()}
            full
            style={{ marginTop: 8 }}
          >
            Verificar de novo
          </Button>
        ) : null}
      </Card>

      {/* Config servidor — recolhido */}
      <Card style={{ marginBottom: 12, padding: 0 }}>
        <button
          type="button"
          className="tap"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '14px 16px',
            background: 'transparent',
            border: 'none',
            textAlign: 'left',
            minHeight: 48,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            Configurar servidor (Evolution)
          </span>
          {showAdvanced ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showAdvanced ? (
          <div style={{ padding: '0 16px 16px' }}>
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 12,
                color: 'var(--color-text-muted)',
                lineHeight: 1.45,
              }}
            >
              Mesma Evolution do Viver Sempre Bem. URL já vem preenchida. Só
              falta a <strong>chave master</strong> (do servidor VSB —{' '}
              <code>EVOLUTION_API_AUTH_KEY</code>). Instância nova:{' '}
              <strong>lista-zap</strong> (não mexe nas do VSB).
            </p>
            <Field
              label="URL da Evolution (VSB)"
              value={settings.evolutionUrl}
              onChange={(v) => settings.setSettings({ evolutionUrl: v })}
              placeholder="https://wpp.viversemprebemvsb.com"
            />
            <Field
              label="Chave master (EVOLUTION_API_AUTH_KEY)"
              value={settings.evolutionApiKey}
              onChange={(v) => settings.setSettings({ evolutionApiKey: v })}
              placeholder="Cole a chave do servidor VSB"
              type="password"
            />
            <Field
              label="Nome da instância (nova)"
              value={settings.evolutionInstance}
              onChange={(v) => settings.setSettings({ evolutionInstance: v })}
              placeholder="lista-zap"
            />
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 11,
                color: 'var(--color-text-faint)',
                lineHeight: 1.45,
              }}
            >
              Não use nomes de canal do VSB (vsb-*-atd / vsb-*-txn). Lista Zap
              usa a instância <strong>lista-zap</strong> só pra este app.
            </p>
            <Toggle
              label="Modo demo (sem WhatsApp real)"
              description="Simula envios. Desliga sozinho ao tocar em Conectar WhatsApp."
              checked={settings.demoMode}
              onChange={(v) => {
                settings.setSettings({ demoMode: v })
                if (v) {
                  stopPolling()
                  setQrDataUrl(null)
                  setPairingCode(null)
                  setWaStatus('unknown')
                  setWaError(null)
                }
              }}
            />
          </div>
        ) : null}
      </Card>

      <Section title="Gemini">
        <Field
          label="API key"
          value={settings.geminiApiKey}
          onChange={(v) => settings.setSettings({ geminiApiKey: v })}
          type="password"
          placeholder="AIza…"
        />
        <Field
          label="Modelo"
          value={settings.geminiModel}
          onChange={(v) => settings.setSettings({ geminiModel: v })}
          placeholder="gemini-2.0-flash"
        />
      </Section>

      <Section title="Anti-ban / cadência">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <Shield size={15} color="var(--color-accent)" />
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Nível de proteção
          </span>
          {settings.antiBanPreset === 'custom' ? (
            <Badge tone="warn">Manual</Badge>
          ) : (
            <Badge tone="accent">{settings.antiBanPreset}% ativo</Badge>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 14,
          }}
        >
          {ANTI_BAN_PRESETS.map((preset) => (
            <AntiBanPresetCard
              key={preset.id}
              preset={preset}
              active={settings.antiBanPreset === preset.id}
              onSelect={() => {
                settings.applyAntiBanPreset(preset.id)
                toast.success(`Anti-ban ${preset.label} · ${preset.title}`)
              }}
            />
          ))}
        </div>

        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Tempos atuais
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}
        >
          <Num
            label="Delay min (s)"
            value={settings.minDelaySec}
            onChange={(v) => settings.setAntiBanTiming({ minDelaySec: v })}
          />
          <Num
            label="Delay max (s)"
            value={settings.maxDelaySec}
            onChange={(v) => settings.setAntiBanTiming({ maxDelaySec: v })}
          />
          <Num
            label="Lote"
            value={settings.batchSize}
            onChange={(v) => settings.setAntiBanTiming({ batchSize: v })}
          />
          <Num
            label="Pausa lote (s)"
            value={settings.batchPauseSec}
            onChange={(v) => settings.setAntiBanTiming({ batchPauseSec: v })}
          />
          <Num
            label="Janela início"
            value={settings.windowStartHour}
            onChange={(v) =>
              settings.setAntiBanTiming({
                windowStartHour: Math.min(23, Math.max(0, v)),
              })
            }
          />
          <Num
            label="Janela fim"
            value={settings.windowEndHour}
            onChange={(v) =>
              settings.setAntiBanTiming({
                windowEndHour: Math.min(23, Math.max(0, v)),
              })
            }
          />
        </div>
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 12,
            color: 'var(--color-text-muted)',
            lineHeight: 1.45,
          }}
        >
          Em demo os delays ficam curtos (1–3s). Em live: delay aleatório entre
          min/max, pausa entre lotes e só envia na janela de horário. Ajustar
          números manualmente vira modo <strong>Manual</strong>.
        </p>
      </Section>

      <Card style={{ marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 8,
          }}
        >
          <KeyRound size={16} color="var(--color-text-muted)" />
          <div style={{ fontWeight: 600, fontSize: 14 }}>Login / PIN</div>
        </div>
        <p
          style={{
            margin: '0 0 10px',
            fontSize: 12,
            color: 'var(--color-text-muted)',
            lineHeight: 1.45,
          }}
        >
          PIN (mín. 6) trava a UI nesta aba e para a fila. Não cifra o disco —
          use wipe com PIN em aparelho compartilhado. CPF nunca no WhatsApp.
        </p>
        <Link to="/login" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" icon={<Link2 size={16} />} full>
            Abrir login / bloqueio
          </Button>
        </Link>
      </Card>

      <Card tone="warn" style={{ marginBottom: 12, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
          Dados sensíveis
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 12,
            color: 'var(--color-text-muted)',
            lineHeight: 1.5,
          }}
        >
          <li>CPF só na base local — proibido em texto/caption WhatsApp</li>
          <li>Keys Evolution/Gemini ficam no localStorage deste browser</li>
          <li>Em aparelho compartilhado: ative PIN e use “Apagar dados”</li>
        </ul>
      </Card>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card style={{ marginBottom: 12 }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 12,
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </div>
      {children}
    </Card>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  )
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        inputMode="numeric"
      />
    </div>
  )
}

function StatusBadge({ status }: { status: WaConnectionStatus }) {
  if (status === 'open')
    return (
      <Badge tone="success">
        <Wifi size={12} /> open
      </Badge>
    )
  if (status === 'connecting') return <Badge tone="info">connecting</Badge>
  if (status === 'close')
    return (
      <Badge tone="warn">
        <WifiOff size={12} /> close
      </Badge>
    )
  if (status === 'error') return <Badge tone="danger">error</Badge>
  return <Badge tone="neutral">unknown</Badge>
}

function AntiBanPresetCard({
  preset,
  active,
  onSelect,
}: {
  preset: AntiBanPreset
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className="tap"
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '12px 13px',
        borderRadius: 14,
        border: active
          ? '1px solid color-mix(in oklab, var(--color-accent) 55%, transparent)'
          : '1px solid var(--color-border)',
        background: active ? 'var(--color-accent-soft)' : 'var(--color-bg-elevated)',
        boxShadow: active
          ? '0 0 0 1px color-mix(in oklab, var(--color-accent) 20%, transparent)'
          : 'none',
        transitionProperty: 'background-color, border-color, box-shadow',
        transitionDuration: '150ms',
        minHeight: 44,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            className="display-title"
            style={{
              fontSize: 22,
              color: active ? 'var(--color-accent)' : 'var(--color-text)',
            }}
          >
            {preset.label}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-text)',
            }}
          >
            {preset.title}
          </span>
        </div>
        {active ? <Badge tone="accent">Ativo</Badge> : null}
      </div>
      <p
        style={{
          margin: '0 0 10px',
          fontSize: 12.5,
          color: 'var(--color-text-muted)',
          lineHeight: 1.4,
        }}
      >
        {preset.description}
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: active ? 'var(--color-text)' : 'var(--color-text-faint)',
        }}
      >
        <span>
          Delay {preset.minDelaySec}–{preset.maxDelaySec}s
        </span>
        <span>Lote {preset.batchSize}</span>
        <span>Pausa {formatDuration(preset.batchPauseSec)}</span>
        <span>
          Janela {preset.windowStartHour}h–{preset.windowEndHour}h
        </span>
      </div>
    </button>
  )
}
