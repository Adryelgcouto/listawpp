export type ContactStatus = 'unknown' | 'validated' | 'failed' | 'blocked'

export type QueueItemStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'skipped'

export interface Client {
  id: string
  name: string
  phone: string
  cpf: string
  contactStatus: ContactStatus
  notes: string
  createdAt: string
  updatedAt: string
  lastContactAt?: string
}

export interface ExtractedRow {
  id: string
  nome: string
  telefone: string
  cpf: string
  confidence: number
  uncertain: boolean
  selected: boolean
}

export type QueueMessageSource = 'template' | 'rewrite' | 'fallback' | 'demo'

export interface QueueItem {
  id: string
  clientId: string
  name: string
  phone: string
  status: QueueItemStatus
  /** Preview curto (persistido) */
  messagePreview?: string
  /** Texto completo enviado — só memória de sessão (não persistir) */
  messageText?: string
  messageSource?: QueueMessageSource
  error?: string
  createdAt: string
  sentAt?: string
  attempts: number
}

export interface QueueLog {
  id: string
  at: string
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
  itemId?: string
}

export type WaConnectionStatus =
  | 'unknown'
  | 'open'
  | 'close'
  | 'connecting'
  | 'error'

export type AntiBanPresetId = '20' | '90' | '100' | 'custom'

export interface Settings {
  demoMode: boolean
  evolutionUrl: string
  evolutionApiKey: string
  evolutionInstance: string
  geminiApiKey: string
  geminiModel: string
  messageTemplate: string
  /** Preset visual: 20% | 90% | 100% | custom (manual) */
  antiBanPreset: AntiBanPresetId
  minDelaySec: number
  maxDelaySec: number
  batchSize: number
  batchPauseSec: number
  windowStartHour: number
  windowEndHour: number
  /** Se true, a fila envia mesmo fora da janela habitual */
  allowOutsideWindow: boolean
  sendImage: boolean
  useGeminiRewrite: boolean
  commercialImageDataUrl: string | null
}

/** Blocos separados por linha em branco — é assim que chega bonito no WhatsApp. */
export const DEFAULT_TEMPLATE = [
  'Olá {nome}! Tudo bem?',
  'Passando pra te apresentar uma condição especial.',
  'Posso te explicar em 2 minutos?',
].join('\n\n')

/** Default = 90% anti-ban (recomendado) */
export const DEFAULT_SETTINGS: Settings = {
  demoMode: true,
  /** Evolution pública do VSB (path /evolution no nginx) */
  evolutionUrl: 'https://adryel.giize.com/evolution',
  evolutionApiKey: '',
  evolutionInstance: 'lista-zap',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  messageTemplate: DEFAULT_TEMPLATE,
  antiBanPreset: '90',
  minDelaySec: 12,
  maxDelaySec: 35,
  batchSize: 12,
  batchPauseSec: 240,
  windowStartHour: 8,
  windowEndHour: 20,
  allowOutsideWindow: false,
  sendImage: false,
  /** H2: rewrite Gemini é opt-in (default false) */
  useGeminiRewrite: false,
  commercialImageDataUrl: null,
}
