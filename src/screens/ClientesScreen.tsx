import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input, Label } from '@/components/ui/Input'
import { maskCpf } from '@/lib/cpf'
import { formatPhoneDisplay, isValidBrPhone } from '@/lib/phone'
import { useClientsStore } from '@/stores/clients'
import type { ContactStatus } from '@/types'

export function ClientesScreen() {
  const clients = useClientsStore((s) => s.clients)
  const searchFn = useClientsStore((s) => s.search)
  const addManual = useClientsStore((s) => s.addManual)
  const deleteClient = useClientsStore((s) => s.deleteClient)
  const setContactStatus = useClientsStore((s) => s.setContactStatus)

  const [q, setQ] = useState('')
  const [revealCpf, setRevealCpf] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [cpf, setCpf] = useState('')

  const list = useMemo(() => searchFn(q), [searchFn, q, clients])

  const submitAdd = () => {
    if (!name.trim() || !isValidBrPhone(phone)) {
      toast.error('Nome e telefone BR válidos (DDD + número) são obrigatórios')
      return
    }
    try {
      addManual({ name, phone, cpf })
      toast.success('Cliente adicionado')
      setName('')
      setPhone('')
      setCpf('')
      setShowAdd(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar')
    }
  }

  return (
    <div>
      <PageHeader
        title="Base"
        eyebrow="Clientes"
        subtitle={`${clients.length} no aparelho · CPF só interno`}
        right={
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus size={16} />}
            onClick={() => setShowAdd((v) => !v)}
          >
            Novo
          </Button>
        }
      />

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-text-faint)',
          }}
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nome, telefone ou CPF"
          style={{ paddingLeft: 36 }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 10,
        }}
      >
        <Button
          size="sm"
          variant="ghost"
          icon={revealCpf ? <EyeOff size={16} /> : <Eye size={16} />}
          onClick={() => setRevealCpf((v) => !v)}
        >
          {revealCpf ? 'Ocultar CPF' : 'Revelar CPF'}
        </Button>
      </div>

      {showAdd ? (
        <Card style={{ marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            <UserPlus size={16} color="var(--color-accent)" />
            Adicionar manual
          </div>
          <Label>Nome</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <Label>Telefone</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="DDD + número"
            style={{ marginBottom: 8 }}
          />
          <Label>CPF (interno)</Label>
          <Input
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            inputMode="numeric"
            style={{ marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              onClick={() => setShowAdd(false)}
              style={{ flex: 1 }}
            >
              Cancelar
            </Button>
            <Button onClick={submitAdd} style={{ flex: 1 }}>
              Salvar
            </Button>
          </div>
        </Card>
      ) : null}

      {list.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Users size={24} />}
            title={q ? 'Nenhum resultado' : 'Sem clientes ainda'}
            description={
              q
                ? 'Tente outro nome, telefone ou CPF.'
                : 'Escaneie uma lista ou adicione um contato manualmente.'
            }
            action={
              !q ? (
                <Button
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() => setShowAdd(true)}
                >
                  Adicionar
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((c) => (
            <Card key={c.id} style={{ padding: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 15,
                      letterSpacing: '-0.02em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.name}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--color-text-muted)',
                      fontFamily: 'var(--font-mono)',
                      marginTop: 2,
                    }}
                  >
                    {formatPhoneDisplay(c.phone)}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-faint)',
                      fontFamily: 'var(--font-mono)',
                      marginTop: 4,
                    }}
                  >
                    CPF {maskCpf(c.cpf, revealCpf)}
                  </div>
                </div>
                <StatusBadge status={c.contactStatus} />
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginTop: 10,
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<CheckCircle2 size={14} />}
                  onClick={() => {
                    setContactStatus(c.id, 'validated')
                    toast.success('Marcado como validado')
                  }}
                >
                  Validar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<XCircle size={14} />}
                  onClick={() => setContactStatus(c.id, 'failed')}
                >
                  Falha
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={14} />}
                  onClick={() => {
                    deleteClient(c.id)
                    toast.message('Cliente removido')
                  }}
                >
                  Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ContactStatus }) {
  if (status === 'validated') return <Badge tone="success">Validado</Badge>
  if (status === 'failed') return <Badge tone="danger">Falha</Badge>
  if (status === 'blocked') return <Badge tone="warn">Bloqueado</Badge>
  return <Badge tone="neutral">Novo</Badge>
}
