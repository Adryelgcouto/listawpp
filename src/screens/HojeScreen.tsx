import { useEffect } from 'react'
import {
  ImagePlus,
  Pause,
  Play,
  ShieldAlert,
  Sparkles,
  Square,
  Camera,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Label, TextArea } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { applyTemplate } from '@/lib/message'
import { seedDemoWorkflow } from '@/lib/seed-demo'
import {
  compressImageFile,
  loadCommercialImage,
  saveCommercialImage,
} from '@/lib/image-store'
import {
  pauseQueueWorker,
  startQueueWorker,
  stopQueueWorker,
} from '@/lib/queue-worker'
import { queueStats, useQueueStore } from '@/stores/queue'
import { useClientsStore } from '@/stores/clients'
import { useSettingsStore } from '@/stores/settings'

export function HojeScreen() {
  const clients = useClientsStore((s) => s.clients)
  const items = useQueueStore((s) => s.items)
  const running = useQueueStore((s) => s.running)
  const paused = useQueueStore((s) => s.paused)
  const sentToday = useQueueStore((s) => s.sentToday)
  const logs = useQueueStore((s) => s.logs)
  const settings = useSettingsStore()
  const stats = queueStats(items)
  const validated = clients.filter((c) => c.contactStatus === 'validated').length
  const isEmpty = clients.length === 0 && stats.total === 0
  const nextPending = items.find((i) => i.status === 'pending')
  const preview = applyTemplate(
    settings.messageTemplate,
    nextPending?.name ?? 'Maria',
  )
  const latestLog = logs[0]

  // H5: carrega imagem do IndexedDB
  useEffect(() => {
    void loadCommercialImage().then((url) => {
      if (url && !settings.commercialImageDataUrl) {
        settings.setSettings({ commercialImageDataUrl: url })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onPickImage = async (file: File | null) => {
    if (!file) return
    try {
      const dataUrl = await compressImageFile(file)
      await saveCommercialImage(dataUrl)
      settings.setSettings({ commercialImageDataUrl: dataUrl })
      toast.success('Imagem comercial salva (IndexedDB)')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar imagem')
    }
  }

  const loadDemo = () => {
    const r = seedDemoWorkflow()
    toast.success(`${r.clients} clientes · ${r.queued} na fila`)
  }

  return (
    <div>
      <PageHeader
        title="Hoje"
        subtitle={
          settings.demoMode
            ? 'Modo demo — envios simulados neste aparelho'
            : 'Envios reais pela Evolution API'
        }
        right={
          settings.demoMode ? (
            <Badge tone="accent">Demo</Badge>
          ) : (
            <Badge tone="success">Live</Badge>
          )
        }
      />

      {isEmpty ? (
        <Card tone="accent" style={{ marginBottom: 16, padding: 18 }}>
          <div className="eyebrow" style={{ color: 'var(--color-accent)', marginBottom: 8 }}>
            Comece em 10 segundos
          </div>
          <div
            className="display-title"
            style={{ fontSize: 22, marginBottom: 8, color: 'var(--color-text)' }}
          >
            Carregue uma lista demo e rode a fila.
          </div>
          <p
            style={{
              margin: '0 0 16px',
              fontSize: 14,
              color: 'var(--color-text-muted)',
              lineHeight: 1.45,
            }}
          >
            Sem chave Gemini e sem Evolution. Você vê o fluxo completo: clientes,
            fila, envio e CPF mascarado.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button icon={<Sparkles size={16} />} onClick={loadDemo} style={{ flex: 1 }}>
              Lista demo
            </Button>
            <Link to="/escanear" style={{ flex: 1, textDecoration: 'none' }}>
              <Button variant="secondary" icon={<Camera size={16} />} full>
                Escanear
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="stat-strip" style={{ marginBottom: 14 }}>
        <div>
          <div className="stat-value" style={{ color: 'var(--color-accent)' }}>
            {stats.pending}
          </div>
          <div className="stat-label">Fila</div>
        </div>
        <div>
          <div className="stat-value">{sentToday}</div>
          <div className="stat-label">Hoje</div>
        </div>
        <div>
          <div className="stat-value">{clients.length}</div>
          <div className="stat-label">Base</div>
        </div>
        <div>
          <div className="stat-value" style={{ color: 'var(--color-wa)' }}>
            {validated}
          </div>
          <div className="stat-label">Ok</div>
        </div>
      </div>

      <Card style={{ marginBottom: 12, padding: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 17,
                letterSpacing: '-0.03em',
              }}
            >
              {running ? 'Enviando agora' : paused ? 'Fila em pausa' : 'Controle'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {nextPending
                ? `Próximo: ${nextPending.name}`
                : stats.pending
                  ? `${stats.pending} pendente(s)`
                  : 'Nada pendente'}
            </div>
          </div>
          {running ? <Badge tone="success">Ativa</Badge> : null}
        </div>

        {latestLog && (running || paused) ? (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--color-text-faint)',
              marginBottom: 12,
              padding: '8px 10px',
              borderRadius: 10,
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {latestLog.message}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8 }}>
          {!running ? (
            <Button
              icon={<Play size={16} />}
              onClick={() => {
                if (stats.pending === 0) {
                  toast.message('Fila vazia — carregue a lista demo ou escaneie')
                  return
                }
                void startQueueWorker()
                toast.success('Fila iniciada')
              }}
              style={{ flex: 1 }}
            >
              Iniciar
            </Button>
          ) : (
            <Button
              variant="warn"
              icon={<Pause size={16} />}
              onClick={() => {
                pauseQueueWorker()
                toast.message('Fila pausada')
              }}
              style={{ flex: 1 }}
            >
              Pausar
            </Button>
          )}
          <Button
            variant="danger"
            icon={<Square size={14} />}
            onClick={() => {
              stopQueueWorker()
              toast.message('Fila parada')
            }}
            style={{ flex: 1 }}
          >
            Parar
          </Button>
        </div>
      </Card>

      <Card style={{ marginBottom: 12, padding: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 10,
          }}
        >
          <Label>Mensagem</Label>
          <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
            placeholder {'{nome}'}
          </span>
        </div>
        <TextArea
          value={settings.messageTemplate}
          onChange={(e) => settings.setSettings({ messageTemplate: e.target.value })}
          placeholder="Olá {nome}! …"
        />
        <div
          style={{
            marginTop: 12,
            padding: '12px 13px',
            borderRadius: 12,
            background: 'var(--color-bg-elevated)',
            border: '1px dashed var(--color-border-strong)',
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Preview
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.45,
              color: 'var(--color-text)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {preview}
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 12, padding: '6px 14px 14px' }}>
        <Toggle
          label="Reescrever com Gemini"
          description="Opt-in: envia o texto (sem CPF) ao Google a cada mensagem"
          checked={settings.useGeminiRewrite}
          onChange={(v) => settings.setSettings({ useGeminiRewrite: v })}
        />
        <hr className="hairline" />
        <Toggle
          label="Enviar imagem comercial"
          description="Anexa a arte configurada abaixo"
          checked={settings.sendImage}
          onChange={(v) => settings.setSettings({ sendImage: v })}
        />

        <label
          className="tap"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minHeight: 48,
            marginTop: 6,
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px dashed var(--color-border-strong)',
            background: 'var(--color-bg-elevated)',
            cursor: 'pointer',
          }}
        >
          <ImagePlus size={18} color="var(--color-accent)" />
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>
            {settings.commercialImageDataUrl
              ? 'Trocar imagem'
              : 'Escolher imagem comercial'}
          </span>
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
          />
        </label>
        {settings.commercialImageDataUrl ? (
          <img
            src={settings.commercialImageDataUrl}
            alt="Imagem comercial"
            style={{
              marginTop: 10,
              width: '100%',
              maxHeight: 150,
              objectFit: 'cover',
              borderRadius: 12,
            }}
          />
        ) : null}
      </Card>

      {!isEmpty ? (
        <div style={{ marginBottom: 12 }}>
          <Button variant="secondary" full icon={<Sparkles size={15} />} onClick={loadDemo}>
            Recarregar lista demo
          </Button>
        </div>
      ) : null}

      <Card tone="warn" style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <ShieldAlert
            size={18}
            style={{ color: 'var(--color-warn)', flexShrink: 0, marginTop: 1 }}
          />
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-text)' }}>
            <strong style={{ color: 'var(--color-warn)' }}>Uso responsável.</strong>{' '}
            Automação de WhatsApp pode violar os Termos da plataforma. Atrasos e
            lotes reduzem risco — não eliminam. Você responde pelo uso.
          </div>
        </div>
      </Card>
    </div>
  )
}
