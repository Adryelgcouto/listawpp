import { z } from 'zod'

export const ClientSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  phone: z.string(),
  cpf: z.string(),
  contactStatus: z.enum(['unknown', 'validated', 'failed', 'blocked']),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastContactAt: z.string().optional(),
})

export const ClientsPersistSchema = z.object({
  clients: z.array(ClientSchema).default([]),
})

export const QueueItemSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string(),
  phone: z.string(),
  status: z.enum(['pending', 'sending', 'sent', 'failed', 'skipped']),
  messagePreview: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  sentAt: z.string().optional(),
  attempts: z.number(),
})

export const QueuePersistSchema = z.object({
  items: z.array(QueueItemSchema).default([]),
  running: z.boolean().optional(),
  paused: z.boolean().optional(),
  logs: z
    .array(
      z.object({
        id: z.string(),
        at: z.string(),
        level: z.enum(['info', 'success', 'warn', 'error']),
        message: z.string(),
        itemId: z.string().optional(),
      }),
    )
    .default([]),
  sentToday: z.number().default(0),
  sentTodayDate: z.string().optional(),
  lastBatchCount: z.number().optional(),
})

export const SettingsPersistSchema = z.object({
  demoMode: z.boolean().optional(),
  evolutionUrl: z.string().optional(),
  evolutionApiKey: z.string().optional(),
  evolutionInstance: z.string().optional(),
  geminiApiKey: z.string().optional(),
  geminiModel: z.string().optional(),
  messageTemplate: z.string().optional(),
  antiBanPreset: z.enum(['20', '90', '100', 'custom']).optional(),
  minDelaySec: z.number().optional(),
  maxDelaySec: z.number().optional(),
  batchSize: z.number().optional(),
  batchPauseSec: z.number().optional(),
  windowStartHour: z.number().optional(),
  windowEndHour: z.number().optional(),
  sendImage: z.boolean().optional(),
  useGeminiRewrite: z.boolean().optional(),
  commercialImageDataUrl: z.string().nullable().optional(),
})

export function safeParsePersist<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  fallback: T,
): T {
  const r = schema.safeParse(raw)
  if (r.success) return r.data
  return fallback
}
