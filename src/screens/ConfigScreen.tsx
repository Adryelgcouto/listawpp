import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  KeyRound,
  Link2,
  QrCode,
  RefreshCw,
  Shield,
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
  fetchQrCode,
  getConnectionState,
  resolveEvolutionFetchBase,
  testEvolutionConnection,
} from '@/lib/evolution'
import { isSafeEvolutionUrl } from '@/lib/security'
import { useSettingsStore } from '@/stores/settings'
import type { WaConnectionStatus } from '@/types'

const MAX_QR_POLLS = 20
const POLL_MS = 3000

export function ConfigScreen() {
  const settings = useSettingsStore()
  const [waStatus, setWaStatus] = useState<WaConnectionStatus>('unknown')
  const [waError, setWaError] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [testing, setTesting] = useState(false)
  const pollTimer = useRef<number | null>(null)
  const pollCountRef = useRef(0)
  const abortRef = useRef(false)
  const proxyInfo = resolveEvolutionFetchBase(settings.evolutionUrl)

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
    if (!settings.evolutionUrl || !settings.evolutionApiKey) {
      setWaStatus('unknown')
      setWaError('Configure URL e API key da Evolution')
      return 'unknown' as WaConnectionStatus
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
    void refreshStatus()
  }, [refreshStatus])

  const generateQr = async () => {
    stopPolling()
    setWaError(null)
    setQrDataUrl(null)

    if (settings.demoMode) {
      setWaStatus('open')
      toast.message('Modo demo: WhatsApp simulado como conectado')
      return
    }

    const status = await refreshStatus()
    if (status === 'open') {
      setQrDataUrl(null)
      toast.success('Já conectado — QR desnecessário')
      return
    }

    setPolling(true)
    abortRef.current = false
    pollCountRef.current = 0
    setPollCount(0)
    setWaStatus('connecting')

    const tick = async () => {
      if (abortRef.current) return
      if (pollCountRef.current >= MAX_QR_POLLS) {
        stopPolling()
        setWaError(
          `Limite de ${MAX_QR_POLLS} tentativas atingido. Toque em Gerar QR de novo.`,
        )
        setWaStatus('error')
        return
      }

      pollCountRef.current += 1
      setPollCount(pollCountRef.current)

      try {
        const state = await getConnectionState(
          settings.evolutionUrl,
          settings.evolutionApiKey,
          settings.evolutionInstance,
        )
        if (state.status === 'open') {
          setWaStatus('open')
          setQrDataUrl(null)
          setWaError(null)
          stopPolling()
          toast.success('WhatsApp conectado!')
          return
        }
        if (state.error) setWaError(state.error)

        const qr = await fetchQrCode(
          settings.evolutionUrl,
          settings.evolutionApiKey,
          settings.evolutionInstance,
        )
        if (qr.qr) {
          setQrDataUrl(qr.qr)
          setWaStatus('connecting')
          setWaError(null)
        } else if (qr.error) {
          setWaError(qr.error)
          setWaStatus('error')
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setWaError(msg)
        setWaStatus('error')
      }

      if (abortRef.current) return
      if (pollCountRef.current >= MAX_QR_POLLS) {
        stopPolling()
        setWaError(`Limite de ${MAX_QR_POLLS} tentativas atingido.`)
        return
      }
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

      <Card style={{ marginBottom: 12 }}>
        <Toggle
          label="Modo demo"
          description={
            settings.demoMode
              ? 'LIGADO: envios e QR são simulados — Evolution NÃO é chamada'
              : 'Desligado: envios reais pela Evolution API'
          }
          checked={settings.demoMode}
          onChange={(v) => {
            settings.setSettings({ demoMode: v })
            if (v) {
              stopPolling()
              setQrDataUrl(null)
              setWaStatus('open')
              setWaError(null)
              toast.message('Demo ON — Evolution ignorada')
            } else {
              toast.success('Demo OFF — Evolution ativa')
              void refreshStatus()
            }
          }}
        />
        {settings.demoMode ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              lineHeight: 1.45,
              color: 'var(--color-warn)',
              background: 'var(--color-warn-soft)',
              border: '1px solid color-mix(in oklab, var(--color-warn) 30%, transparent)',
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            <strong>Por que “Evolution não funciona”?</strong> Com demo ligado o
            app nunca chama a API. Desligue o modo demo acima pra testar de
            verdade.
          </div>
        ) : null}
      </Card>

      <Section title="WhatsApp (Evolution)">
        <Field
          label="URL base"
          value={settings.evolutionUrl}
          onChange={(v) => {
            settings.setSettings({ evolutionUrl: v })
            const check = isSafeEvolutionUrl(v)
            if (v.trim() && !check.ok) {
              toast.message(check.reason ?? 'URL insegura')
            }
          }}
          placeholder="http://127.0.0.1:8081 ou https://evo.seudominio.com"
        />
        {settings.evolutionUrl.trim() &&
        !isSafeEvolutionUrl(settings.evolutionUrl).ok ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-danger)',
              marginBottom: 10,
            }}
          >
            {isSafeEvolutionUrl(settings.evolutionUrl).reason}
          </div>
        ) : null}
        <p
          style={{
            margin: '0 0 10px',
            fontSize: 11,
            color: 'var(--color-text-faint)',
            lineHeight: 1.4,
          }}
        >
          {proxyInfo.viaProxy
            ? 'Localhost → proxy /evo (sem CORS no dev).'
            : 'URL remota → precisa CORS na Evolution (CORS_ORIGIN). No celular use o IP da máquina (ex.: http://192.168.0.198:8081), não localhost.'}
        </p>
        <Field
          label="API key"
          value={settings.evolutionApiKey}
          onChange={(v) => settings.setSettings({ evolutionApiKey: v })}
          placeholder="AUTHENTICATION_API_KEY da Evolution"
          type="password"
        />
        <Field
          label="Instância (nome)"
          value={settings.evolutionInstance}
          onChange={(v) => settings.setSettings({ evolutionInstance: v })}
          placeholder="lista-zap"
        />
        <p
          style={{
            margin: '0 0 10px',
            fontSize: 11,
            color: 'var(--color-text-faint)',
          }}
        >
          Use o <strong>nome</strong> da instância (ex.: lista-zap), não o UUID.
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginTop: 4,
            marginBottom: 10,
          }}
        >
          <StatusBadge status={settings.demoMode ? 'open' : waStatus} />
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw size={14} />}
            disabled={settings.demoMode}
            onClick={() => void refreshStatus()}
          >
            Atualizar
          </Button>
        </div>

        {waError && !settings.demoMode ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-danger)',
              background: 'var(--color-danger-soft)',
              border:
                '1px solid color-mix(in oklab, var(--color-danger) 30%, transparent)',
              borderRadius: 10,
              padding: '10px 12px',
              marginBottom: 10,
              wordBreak: 'break-word',
            }}
          >
            {waError}
          </div>
        ) : null}

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
              fontSize: 13,
              color: 'var(--color-accent)',
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            <Wifi size={16} />
            Conectado — QR não necessário
          </div>
        ) : null}

        {qrDataUrl && waStatus !== 'open' && !settings.demoMode ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <img
              src={qrDataUrl}
              alt="QR Code WhatsApp"
              style={{
                width: 220,
                height: 220,
                borderRadius: 12,
                background: '#fff',
                padding: 8,
                border: '1px solid var(--color-border)',
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Escaneie no WhatsApp · tentativa {pollCount}/{MAX_QR_POLLS}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            disabled={testing || settings.demoMode}
            onClick={() => {
              void (async () => {
                setTesting(true)
                setWaError(null)
                const r = await testEvolutionConnection({
                  url: settings.evolutionUrl,
                  apiKey: settings.evolutionApiKey,
                  instance: settings.evolutionInstance,
                })
                setTesting(false)
                if (r.status) setWaStatus(r.status)
                if (r.ok) {
                  toast.success(r.message)
                  setWaError(null)
                } else {
                  toast.error(r.message)
                  setWaError(r.message)
                  setWaStatus('error')
                }
              })()
            }}
            style={{ flex: 1 }}
          >
            {testing ? 'Testando…' : 'Testar conexão'}
          </Button>
          <Button
            icon={<QrCode size={16} />}
            onClick={() => void generateQr()}
            disabled={
              settings.demoMode || (polling && waStatus !== 'error')
            }
            style={{ flex: 1 }}
          >
            {polling ? 'Aguardando…' : 'Gerar QR'}
          </Button>
        </div>
        {polling ? (
          <Button
            variant="secondary"
            onClick={stopPolling}
            full
            style={{ marginTop: 8 }}
          >
            Parar poll
          </Button>
        ) : null}
      </Section>

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
