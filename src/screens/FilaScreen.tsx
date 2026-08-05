import { useRef } from 'react'
import {
  Download,
  Inbox,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Square,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatPhoneDisplay } from '@/lib/phone'
import { applyTemplate } from '@/lib/message'
import {
  pauseQueueWorker,
  startQueueWorker,
  stopQueueWorker,
} from '@/lib/queue-worker'
import {
  buildPendingCsv,
  buildTransferFile,
  downloadTextFile,
  parseTransferFile,
  pendingItems,
  serializeTransferFile,
  transferFileName,
} from '@/lib/transfer'
import { queueStats, useQueueStore } from '@/stores/queue'
import { useClientsStore } from '@/stores/clients'
import { useSettingsStore } from '@/stores/settings'
import type { QueueItem, QueueItemStatus } from '@/types'

export function FilaScreen() {
  const items = useQueueStore((s) => s.items)
  const logs = useQueueStore((s) => s.logs)
  const running = useQueueStore((s) => s.running)
  const paused = useQueueStore((s) => s.paused)
  const skipItem = useQueueStore((s) => s.skipItem)
  const resetFailedToPending = useQueueStore((s) => s.resetFailedToPending)
  const clearQueue = useQueueStore((s) => s.clearQueue)
  const clearLogs = useQueueStore((s) => s.clearLogs)
  const importContacts = useQueueStore((s) => s.importContacts)
  const upsertFromRows = useClientsStore((s) => s.upsertFromRows)
  const settings = useSettingsStore()
  const stats = queueStats(items)
  const backupRef = useRef<HTMLInputElement>(null)

  const progress =
    stats.total === 0
      ? 0
      : Math.round(((stats.sent + stats.skipped) / stats.total) * 100)

  const firstPending = items.find((i) => i.status === 'pending')
  const nextText = firstPending
    ? applyTemplate(settings.messageTemplate, firstPending.name)
    : null

  const faltam = pendingItems(items).length

  const exportPendingCsv = () => {
    if (faltam === 0) {
      toast.message('Não falta ninguém na fila')
      return
    }
    const now = new Date().toISOString()
    downloadTextFile(
      transferFileName('pendentes', now, 'csv'),
      buildPendingCsv(items),
      'text/csv',
    )
    toast.success(`${faltam} contato(s) que ainda faltam exportados`)
  }

  const exportBackup = () => {
    if (items.length === 0) {
      toast.message('Fila vazia — nada pra transferir')
      return
    }
    const now = new Date().toISOString()
    downloadTextFile(
      transferFileName('fila', now, 'json'),
      serializeTransferFile(
        buildTransferFile({
          items,
          messageTemplate: settings.messageTemplate,
          now,
        }),
      ),
      'application/json',
    )
    toast.success('Backup da fila exportado (com quem já recebeu)')
  }

  const importBackup = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    try {
      const parsed = parseTransferFile(await file.text())
      if (!parsed.ok) {
        toast.error(parsed.error)
        return
      }

      // cria/atualiza os clientes primeiro, pra fila apontar pro cadastro certo
      const clients = upsertFromRows(
        parsed.file.contatos.map((c, i) => ({
          id: `imp-${i}`,
          nome: c.nome,
          telefone: c.telefone,
          cpf: '',
          confidence: 1,
          uncertain: false,
          selected: true,
        })),
      )
      const idByPhone = new Map(clients.map((c) => [c.phone, c.id]))

      const r = importContacts(parsed.file.contatos, (p) => idByPhone.get(p))
      if (parsed.file.mensagem && parsed.file.mensagem !== settings.messageTemplate) {
        settings.setSettings({ messageTemplate: parsed.file.mensagem })
      }
      toast.success(
        `${r.novos} novo(s), ${r.atualizados} atualizado(s) · ${r.jaEnviados} já enviado(s) não vão de novo`,
      )
      if (parsed.ignorados > 0) {
        toast.message(`${parsed.ignorados} linha(s) sem telefone válido ignorada(s)`)
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? `Falha ao ler backup: ${e.message}` : 'Falha ao ler backup',
      )
    } finally {
      if (backupRef.current) backupRef.current.value = ''
    }
  }

  return (
    <div>
      <PageHeader
        title="Fila"
        eyebrow="Envio"
        subtitle={
          running
            ? 'Enviando agora'
            : paused
              ? 'Pausada'
              : `${stats.pending} pendente(s)`
        }
        right={
          running ? (
            <Badge tone="success">Ativa</Badge>
          ) : paused ? (
            <Badge tone="warn">Pausa</Badge>
          ) : (
            <Badge tone="neutral">Parada</Badge>
          )
        }
      />

      <Card style={{ marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            color: 'var(--color-text-muted)',
            marginBottom: 8,
          }}
        >
          <span>Progresso</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: 'var(--color-surface-3)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #148a4b, #1fbf6a)',
              transition: 'width 300ms ease',
            }}
          />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            marginTop: 12,
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--color-text-muted)',
          }}
        >
          <MiniStat label="Pend." value={stats.pending} />
          <MiniStat label="Env." value={stats.sent} />
          <MiniStat label="Falha" value={stats.failed} />
          <MiniStat label="Skip" value={stats.skipped} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {!running ? (
            <Button
              icon={<Play size={16} />}
              onClick={() => {
                if (stats.pending === 0) {
                  toast.message('Nada pendente na fila')
                  return
                }
                void startQueueWorker()
              }}
              style={{ flex: 1 }}
            >
              Iniciar
            </Button>
          ) : (
            <Button
              variant="warn"
              icon={<Pause size={16} />}
              onClick={() => pauseQueueWorker()}
              style={{ flex: 1 }}
            >
              Pausar
            </Button>
          )}
          <Button
            variant="danger"
            icon={<Square size={14} />}
            onClick={() => stopQueueWorker()}
            style={{ flex: 1 }}
          >
            Parar
          </Button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <Button
            size="sm"
            variant="secondary"
            icon={<SkipForward size={14} />}
            disabled={!firstPending}
            onClick={() => {
              if (!firstPending) return
              skipItem(firstPending.id)
              toast.message('Item pulado')
            }}
            style={{ flex: 1 }}
          >
            Pular próximo
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw size={14} />}
            onClick={() => {
              resetFailedToPending()
              toast.message('Falhas voltaram para pendente')
            }}
            style={{ flex: 1 }}
          >
            Reset falhas
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 size={14} />}
            onClick={() => {
              stopQueueWorker()
              clearQueue()
              toast.message('Fila limpa')
            }}
          >
            Limpar
          </Button>
        </div>
      </Card>

      <Card style={{ marginBottom: 12, padding: 14 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <div className="eyebrow" style={{ margin: 0 }}>
            Levar pra outro celular
          </div>
          <span
            style={{
              fontSize: 11,
              color: 'var(--color-text-faint)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            faltam {faltam}
          </span>
        </div>
        <p
          style={{
            margin: '0 0 10px',
            fontSize: 11.5,
            color: 'var(--color-text-muted)',
            lineHeight: 1.45,
          }}
        >
          O backup leva a fila inteira com quem já recebeu — ao importar no outro
          aparelho, quem já foi enviado não vai de novo. Sem CPF e sem chave de API.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={14} />}
            onClick={exportBackup}
            style={{ flex: 1 }}
          >
            Exportar backup
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Upload size={14} />}
            onClick={() => backupRef.current?.click()}
            style={{ flex: 1 }}
          >
            Importar backup
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Download size={14} />}
            onClick={exportPendingCsv}
          >
            Só quem falta (CSV)
          </Button>
        </div>
        <input
          ref={backupRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => void importBackup(e.target.files)}
        />
      </Card>

      {nextText && firstPending ? (
        <Card style={{ marginBottom: 12, padding: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              Próximo envio · {firstPending.name}
            </div>
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-text-faint)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {nextText.length} chars
              {settings.useGeminiRewrite ? ' · base' : ' · exato'}
            </span>
          </div>
          <div
            style={{
              fontSize: 13.5,
              lineHeight: 1.45,
              color: 'var(--color-text)',
              whiteSpace: 'pre-wrap',
              padding: '10px 12px',
              borderRadius: 12,
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
            }}
          >
            {nextText}
          </div>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 11.5,
              color: 'var(--color-text-muted)',
              lineHeight: 1.4,
            }}
          >
            {settings.useGeminiRewrite
              ? 'Rewrite Gemini ligado: pode variar. Se falhar, manda este texto e o log avisa “template (fallback)”.'
              : 'Rewrite desligado: este é o texto exato que vai no WhatsApp.'}
          </p>
        </Card>
      ) : null}

      {items.length === 0 ? (
        <Card padded={false} style={{ marginBottom: 12 }}>
          <EmptyState
            icon={<Inbox size={24} />}
            title="Fila vazia"
            description="Confirme contatos em Escanear para montar a fila de envio de hoje."
          />
        </Card>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 14,
          }}
        >
          {items
            .slice()
            .reverse()
            .map((item) => (
              <QueueRow key={item.id} item={item} onSkip={() => skipItem(item.id)} />
            ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14 }}>Log ao vivo</div>
        <Button size="sm" variant="ghost" onClick={() => clearLogs()}>
          Limpar log
        </Button>
      </div>

      <Card
        style={{
          maxHeight: 220,
          overflowY: 'auto',
          padding: 10,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          background: 'var(--color-bg-elevated)',
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: 'var(--color-text-faint)', padding: 8 }}>
            Sem eventos ainda.
          </div>
        ) : (
          logs.map((l) => (
            <div
              key={l.id}
              style={{
                padding: '6px 4px',
                borderBottom: '1px solid var(--color-border)',
                color:
                  l.level === 'error'
                    ? 'var(--color-danger)'
                    : l.level === 'success'
                      ? 'var(--color-accent)'
                      : l.level === 'warn'
                        ? 'var(--color-warn)'
                        : 'var(--color-text-muted)',
                wordBreak: 'break-word',
              }}
            >
              <span style={{ opacity: 0.7 }}>
                {new Date(l.at).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}{' '}
              </span>
              {l.message}
            </div>
          ))
        )}
      </Card>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--color-text)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {label}
    </div>
  )
}

function QueueRow({ item, onSkip }: { item: QueueItem; onSkip: () => void }) {
  return (
    <Card style={{ padding: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {formatPhoneDisplay(item.phone)}
          </div>
          {item.error ? (
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-danger)',
                marginTop: 4,
                wordBreak: 'break-word',
              }}
            >
              {item.error}
            </div>
          ) : null}
          {item.messageSource ? (
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color:
                  item.messageSource === 'rewrite'
                    ? 'var(--color-accent)'
                    : item.messageSource === 'fallback'
                      ? 'var(--color-warn)'
                      : 'var(--color-text-faint)',
                marginTop: 6,
              }}
            >
              {item.messageSource === 'rewrite'
                ? 'Rewrite Gemini'
                : item.messageSource === 'fallback'
                  ? 'Template — fallback'
                  : item.messageSource === 'demo'
                    ? 'Simulado'
                    : 'Template'}
            </div>
          ) : null}
          {item.messageText || item.messagePreview ? (
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                marginTop: 4,
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {item.messageText || item.messagePreview}
            </div>
          ) : null}
        </div>
        <StatusBadge status={item.status} />
      </div>
      {item.status === 'pending' ? (
        <div style={{ marginTop: 8 }}>
          <Button size="sm" variant="ghost" onClick={onSkip}>
            Pular
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

function StatusBadge({ status }: { status: QueueItemStatus }) {
  if (status === 'sent') return <Badge tone="success">Enviado</Badge>
  if (status === 'sending') return <Badge tone="info">Enviando</Badge>
  if (status === 'failed') return <Badge tone="danger">Falha</Badge>
  if (status === 'skipped') return <Badge tone="warn">Pulado</Badge>
  return <Badge tone="neutral">Pendente</Badge>
}
