import { createId } from './id'
import { normalizeCpf } from './cpf'
import { isValidBrPhone, normalizePhone, digitsOnly } from './phone'
import { sanitizePersonName } from './security'
import type { ExtractedRow } from '@/types'
import { read, utils } from '@/vendor/xlsx.mjs'

export type SpreadsheetSource = 'excel' | 'csv'

export type SpreadsheetParseResult = {
  rows: ExtractedRow[]
  source: SpreadsheetSource
  mapping: { nome: string; telefone: string; cpf: string | null }
  sheetName: string
  totalRows: number
  error?: string
}

type ColKey = 'nome' | 'telefone' | 'cpf' | 'ignore'

const NOME_HEADERS =
  /^(nome|name|cliente|contato|full.?name|razao|razão|paciente|pessoa)$/i
const TEL_HEADERS =
  /^(tel|telefone|phone|celular|whatsapp|whats|fone|mobile|cell|numero|número|nro)$/i
const CPF_HEADERS =
  /^(cpf|documento|doc|cic|tax.?id|cadastro)$/i

function normHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-./]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function classifyHeader(h: string): ColKey {
  const n = normHeader(h)
  if (!n) return 'ignore'
  if (NOME_HEADERS.test(n) || n.includes('nome') || n.includes('name'))
    return 'nome'
  if (
    TEL_HEADERS.test(n) ||
    n.includes('telefone') ||
    n.includes('celular') ||
    n.includes('whats') ||
    n.includes('phone')
  )
    return 'telefone'
  if (CPF_HEADERS.test(n) || n.includes('cpf') || n.includes('documento'))
    return 'cpf'
  return 'ignore'
}

/** Detecta colunas por cabeçalho; se fraco, infere pelo conteúdo. */
function mapColumns(
  headers: string[],
  matrix: unknown[][],
): { nome: number; telefone: number; cpf: number | null; labels: Record<string, string> } {
  const byHeader: Partial<Record<ColKey, number>> = {}
  headers.forEach((h, i) => {
    const k = classifyHeader(h)
    if (k !== 'ignore' && byHeader[k] === undefined) byHeader[k] = i
  })

  if (byHeader.nome !== undefined && byHeader.telefone !== undefined) {
    return {
      nome: byHeader.nome,
      telefone: byHeader.telefone,
      cpf: byHeader.cpf ?? null,
      labels: {
        nome: headers[byHeader.nome] || 'Nome',
        telefone: headers[byHeader.telefone] || 'Telefone',
        cpf: byHeader.cpf != null ? headers[byHeader.cpf] || 'CPF' : '',
      },
    }
  }

  // Inferência por conteúdo (amostra até 40 linhas)
  const sample = matrix.slice(0, 40)
  const colCount = Math.max(
    headers.length,
    ...sample.map((r) => (Array.isArray(r) ? r.length : 0)),
    0,
  )
  const scores = Array.from({ length: colCount }, () => ({
    phone: 0,
    cpf: 0,
    name: 0,
  }))

  for (const row of sample) {
    if (!Array.isArray(row)) continue
    for (let i = 0; i < colCount; i++) {
      const cell = String(row[i] ?? '').trim()
      if (!cell) continue
      const d = digitsOnly(cell)
      const phone = normalizePhone(cell)
      if (isValidBrPhone(phone) || (d.length >= 10 && d.length <= 13)) {
        scores[i]!.phone += 2
      } else if (d.length === 11) {
        scores[i]!.cpf += 2
      } else if (/[A-Za-zÀ-ú]{2,}/.test(cell) && d.length < 6) {
        scores[i]!.name += 1
      }
    }
  }

  const telIdx = scores.reduce(
    (best, s, i) => (s.phone > (scores[best]?.phone ?? -1) ? i : best),
    0,
  )
  let nomeIdx = scores.reduce(
    (best, s, i) =>
      i !== telIdx && s.name > (scores[best]?.name ?? -1) ? i : best,
    telIdx === 0 ? 1 : 0,
  )
  if (nomeIdx === telIdx) nomeIdx = telIdx === 0 ? 1 : 0

  let cpfIdx: number | null = null
  let bestCpf = 0
  scores.forEach((s, i) => {
    if (i === telIdx || i === nomeIdx) return
    if (s.cpf > bestCpf) {
      bestCpf = s.cpf
      cpfIdx = i
    }
  })
  if (bestCpf < 1) cpfIdx = null

  return {
    nome: byHeader.nome ?? nomeIdx,
    telefone: byHeader.telefone ?? telIdx,
    cpf: byHeader.cpf ?? cpfIdx,
    labels: {
      nome: headers[byHeader.nome ?? nomeIdx] || `Coluna ${nomeIdx + 1}`,
      telefone: headers[byHeader.telefone ?? telIdx] || `Coluna ${telIdx + 1}`,
      cpf:
        cpfIdx != null
          ? headers[byHeader.cpf ?? cpfIdx] || `Coluna ${cpfIdx + 1}`
          : '',
    },
  }
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel às vezes guarda telefone/CPF como número (perde zeros à esquerda)
    return String(Math.trunc(v))
  }
  return String(v).trim()
}

function rowsFromMatrix(
  matrix: unknown[][],
  hasHeader: boolean,
): {
  rows: ExtractedRow[]
  mapping: SpreadsheetParseResult['mapping']
  totalRows: number
} {
  if (matrix.length === 0) {
    return {
      rows: [],
      mapping: { nome: '—', telefone: '—', cpf: null },
      totalRows: 0,
    }
  }

  const first = (matrix[0] ?? []).map(cellStr)
  const headerScore = first.filter((h) => classifyHeader(h) !== 'ignore').length
  const useHeader = hasHeader || headerScore >= 2

  const headers = useHeader
    ? first.map((h, i) => h || `Coluna ${i + 1}`)
    : first.map((_, i) => `Coluna ${i + 1}`)
  const data = useHeader ? matrix.slice(1) : matrix

  const map = mapColumns(headers, data)
  const out: ExtractedRow[] = []

  for (const raw of data) {
    if (!Array.isArray(raw)) continue
    const nome = sanitizePersonName(cellStr(raw[map.nome]))
    const telRaw = cellStr(raw[map.telefone])
    // número Excel sem zero: se 10/11 dígitos ok; se veio float cientifico, já truncamos
    const telefone = normalizePhone(telRaw)
    const cpf =
      map.cpf != null ? normalizeCpf(cellStr(raw[map.cpf])) : ''

    if (!nome && !telefone && !cpf) continue
    // pula linha que parece cabeçalho repetido
    if (
      /nome|telefone|cpf|phone/i.test(nome) &&
      !isValidBrPhone(telefone)
    )
      continue

    const valid = isValidBrPhone(telefone)
    out.push({
      id: createId('row'),
      nome: nome || 'Sem nome',
      telefone,
      cpf,
      confidence: valid ? 0.95 : 0.55,
      uncertain: !valid,
      selected: valid,
    })
  }

  return {
    rows: out,
    mapping: {
      nome: map.labels.nome || 'Nome',
      telefone: map.labels.telefone || 'Telefone',
      cpf: map.labels.cpf || null,
    },
    totalRows: data.length,
  }
}

function parseCsvText(text: string): unknown[][] {
  const wb = read(text, { type: 'string', raw: false, FS: ';' })
  // tenta ; primeiro (BR); se 1 coluna, tenta ,
  let sheet = wb.Sheets[wb.SheetNames[0]!]
  let matrix = utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][]
  const cols = matrix[0]?.length ?? 0
  if (cols <= 1 && text.includes(',')) {
    const wb2 = read(text, { type: 'string', raw: false, FS: ',' })
    sheet = wb2.Sheets[wb2.SheetNames[0]!]
    matrix = utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][]
  }
  return matrix
}

/**
 * Lê .xlsx / .xls / .csv / .tsv e devolve linhas com Nome, Telefone, CPF.
 * CPF fica só local (nunca no WhatsApp).
 */
export async function parseSpreadsheetFile(
  file: File,
): Promise<SpreadsheetParseResult> {
  const name = file.name.toLowerCase()
  const isCsv =
    name.endsWith('.csv') ||
    name.endsWith('.tsv') ||
    file.type.includes('csv') ||
    file.type.includes('text/')

  try {
    if (isCsv) {
      const text = await file.text()
      const matrix = parseCsvText(text)
      const parsed = rowsFromMatrix(matrix, true)
      if (parsed.rows.length === 0) {
        return {
          ...parsed,
          source: 'csv',
          sheetName: file.name,
          error: 'Nenhuma linha com dados encontrada no CSV.',
        }
      }
      return {
        rows: parsed.rows,
        source: 'csv',
        mapping: parsed.mapping,
        sheetName: file.name,
        totalRows: parsed.totalRows,
      }
    }

    const buf = await file.arrayBuffer()
    const wb = read(buf, { type: 'array', cellDates: false, raw: false })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) {
      return {
        rows: [],
        source: 'excel',
        mapping: { nome: '—', telefone: '—', cpf: null },
        sheetName: '',
        totalRows: 0,
        error: 'Planilha vazia (sem abas).',
      }
    }
    const sheet = wb.Sheets[sheetName]
    const matrix = utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][]

    const parsed = rowsFromMatrix(matrix, true)
    if (parsed.rows.length === 0) {
      return {
        ...parsed,
        source: 'excel',
        sheetName,
        error:
          'Não achei linhas com telefone. Use colunas Nome / Telefone / CPF (ou celular).',
      }
    }
    return {
      rows: parsed.rows,
      source: 'excel',
      mapping: parsed.mapping,
      sheetName,
      totalRows: parsed.totalRows,
    }
  } catch (e) {
    return {
      rows: [],
      source: name.endsWith('.csv') ? 'csv' : 'excel',
      mapping: { nome: '—', telefone: '—', cpf: null },
      sheetName: file.name,
      totalRows: 0,
      error:
        e instanceof Error
          ? `Falha ao ler planilha: ${e.message}`
          : 'Falha ao ler planilha',
    }
  }
}

export function isSpreadsheetFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return (
    n.endsWith('.xlsx') ||
    n.endsWith('.xls') ||
    n.endsWith('.csv') ||
    n.endsWith('.tsv') ||
    n.endsWith('.xlsm') ||
    /spreadsheet|excel|csv/.test(file.type)
  )
}
