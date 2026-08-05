import { useRef, useState } from 'react'
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { extractFromImages } from '@/lib/gemini'
import { normalizeCpf } from '@/lib/cpf'
import {
  formatPhoneDisplay,
  isValidBrPhone,
  normalizePhone,
} from '@/lib/phone'
import { sanitizePersonName } from '@/lib/security'
import { useClientsStore } from '@/stores/clients'
import { useQueueStore } from '@/stores/queue'
import { useSettingsStore } from '@/stores/settings'
import type { ExtractedRow } from '@/types'

export function EscanearScreen() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [rows, setRows] = useState<ExtractedRow[]>([])
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState<'gemini' | 'demo' | null>(null)

  const settings = useSettingsStore()
  const upsertFromRows = useClientsStore((s) => s.upsertFromRows)
  const enqueueClients = useQueueStore((s) => s.enqueueClients)

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files).slice(0, 6)
    const urls: string[] = []
    for (const f of list) {
      if (!f.type.startsWith('image/')) continue
      const data = await readFile(f)
      urls.push(data)
    }
    if (!urls.length) {
      toast.error('Nenhuma imagem válida')
      return
    }
    setPhotos((p) => [...p, ...urls].slice(0, 8))
    toast.success(`${urls.length} foto(s) adicionada(s)`)
  }

  const runExtract = async (forceDemo = false) => {
    setBusy(true)
    try {
      const result = await extractFromImages({
        apiKey: settings.geminiApiKey,
        model: settings.geminiModel,
        dataUrls: photos,
        forceDemo: forceDemo || settings.demoMode || photos.length === 0,
      })
      setRows(result.rows)
      setSource(result.source)
      if (result.error) toast.message(result.error)
      else if (result.source === 'demo')
        toast.message('Lista demo carregada (sem Gemini ou modo demo)')
      else toast.success(`${result.rows.length} contatos extraídos`)
    } finally {
      setBusy(false)
    }
  }

  const confirm = () => {
    const selected = rows.filter(
      (r) => r.selected && isValidBrPhone(r.telefone),
    )
    if (!selected.length) {
      toast.error('Selecione linhas com telefone BR válido (DDD + número)')
      return
    }
    const clients = upsertFromRows(
      selected.map((r) => ({
        ...r,
        nome: sanitizePersonName(r.nome),
        telefone: normalizePhone(r.telefone),
      })),
    )
    const n = enqueueClients(clients)
    toast.success(
      `${clients.length} cliente(s) salvos · ${n} adicionado(s) à fila`,
    )
    setRows([])
    setPhotos([])
    setSource(null)
    void navigate({ to: '/fila' })
  }

  const updateRow = (id: string, patch: Partial<ExtractedRow>) => {
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r
        const next = { ...r, ...patch }
        if (patch.nome !== undefined) {
          next.nome = sanitizePersonName(patch.nome)
        }
        if (patch.telefone !== undefined) {
          next.telefone = normalizePhone(patch.telefone) || patch.telefone
          next.uncertain = !isValidBrPhone(next.telefone) || next.uncertain
        }
        return next
      }),
    )
  }

  return (
    <div>
      <PageHeader
        title="Escanear"
        subtitle="Foto da lista → revisão → fila"
      />

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            icon={<Camera size={16} />}
            onClick={() => cameraRef.current?.click()}
            style={{ flex: 1 }}
          >
            Câmera
          </Button>
          <Button
            variant="secondary"
            icon={<ImagePlus size={16} />}
            onClick={() => fileRef.current?.click()}
            style={{ flex: 1 }}
          >
            Galeria
          </Button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => void addFiles(e.target.files)}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void addFiles(e.target.files)}
        />

        {photos.length > 0 ? (
          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              marginTop: 12,
              paddingBottom: 4,
            }}
            className="no-scrollbar"
          >
            {photos.map((src, i) => (
              <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                <img
                  src={src}
                  alt={`Lista ${i + 1}`}
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: 'cover',
                    borderRadius: 10,
                    border: '1px solid var(--color-border)',
                  }}
                />
                <button
                  type="button"
                  className="tap"
                  aria-label="Remover foto"
                  onClick={() =>
                    setPhotos((p) => p.filter((_, idx) => idx !== i))
                  }
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border: 'none',
                    background: 'var(--color-danger)',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 0,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Button
            icon={
              busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )
            }
            disabled={busy}
            onClick={() => void runExtract(false)}
            style={{ flex: 1 }}
          >
            {busy ? 'Extraindo…' : 'Extrair com IA'}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void runExtract(true)}
            style={{ flex: 1 }}
          >
            Lista demo
          </Button>
        </div>
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 12,
            color: 'var(--color-text-muted)',
            lineHeight: 1.4,
          }}
        >
          Com Gemini: a <strong>foto</strong> vai para o Google. O app não pede
          CPF ao modelo; CPF só se você digitar manualmente.
        </p>
      </Card>

      {rows.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Camera size={24} />}
            title="Nenhuma extração ainda"
            description="Fotografe uma lista de papel ou carregue a lista demo para revisar contatos."
          />
        </Card>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              Revisar {rows.length} linha(s)
            </div>
            {source ? (
              <Badge tone={source === 'gemini' ? 'info' : 'accent'}>
                {source === 'gemini' ? 'Gemini' : 'Demo'}
              </Badge>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((row) => (
              <Card
                key={row.id}
                style={{
                  opacity: row.selected ? 1 : 0.55,
                  borderColor: row.uncertain
                    ? 'color-mix(in oklab, var(--color-warn) 40%, var(--color-border))'
                    : undefined,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    className="tap"
                    onClick={() =>
                      updateRow(row.id, { selected: !row.selected })
                    }
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'transparent',
                      border: 'none',
                      color: row.selected
                        ? 'var(--color-accent)'
                        : 'var(--color-text-muted)',
                      fontWeight: 600,
                      fontSize: 13,
                      padding: 0,
                      minHeight: 44,
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        border: `1.5px solid ${row.selected ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
                        background: row.selected
                          ? 'var(--color-accent)'
                          : 'transparent',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#04140b',
                      }}
                    >
                      {row.selected ? <Check size={14} /> : null}
                    </span>
                    Incluir
                  </button>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {row.uncertain ? <Badge tone="warn">Incerto</Badge> : null}
                    <Badge tone="neutral">
                      {Math.round(row.confidence * 100)}%
                    </Badge>
                    <button
                      type="button"
                      className="tap"
                      aria-label="Remover linha"
                      onClick={() =>
                        setRows((rs) => rs.filter((r) => r.id !== row.id))
                      }
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-faint)',
                        padding: 8,
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <Field
                  label="Nome"
                  value={row.nome}
                  onChange={(v) => updateRow(row.id, { nome: v })}
                />
                <Field
                  label="Telefone"
                  value={row.telefone}
                  onChange={(v) =>
                    updateRow(row.id, { telefone: normalizePhone(v) || v })
                  }
                  inputMode="tel"
                  hint={
                    normalizePhone(row.telefone)
                      ? formatPhoneDisplay(row.telefone)
                      : undefined
                  }
                />
                <Field
                  label="CPF (interno)"
                  value={row.cpf}
                  onChange={(v) =>
                    updateRow(row.id, { cpf: normalizeCpf(v) || v })
                  }
                  inputMode="numeric"
                  hint="Nunca sai no WhatsApp"
                />
              </Card>
            ))}
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              onClick={() => {
                setRows([])
                setSource(null)
              }}
              style={{ flex: 1 }}
            >
              Descartar
            </Button>
            <Button
              icon={<Check size={16} />}
              onClick={confirm}
              style={{ flex: 1 }}
            >
              Confirmar
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  hint?: string
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-text-faint)',
          marginBottom: 5,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {label}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
      />
      {hint ? (
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: 'var(--color-text-faint)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  )
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
