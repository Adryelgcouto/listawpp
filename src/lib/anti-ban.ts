import type { AntiBanPresetId } from '@/types'

export type { AntiBanPresetId }

export interface AntiBanTiming {
  minDelaySec: number
  maxDelaySec: number
  batchSize: number
  batchPauseSec: number
  windowStartHour: number
  windowEndHour: number
}

export interface AntiBanPreset extends AntiBanTiming {
  id: Exclude<AntiBanPresetId, 'custom'>
  label: string
  percent: number
  title: string
  description: string
}

/**
 * Presets de cadência anti-ban.
 * Valores em segundos (delay/pausa) e horas (janela).
 * Não é "bypass" — só reduz ritmo de envio.
 */
export const ANTI_BAN_PRESETS: AntiBanPreset[] = [
  {
    id: '20',
    percent: 20,
    label: '20%',
    title: 'Rápido',
    description: 'Mais envios por hora. Risco maior de bloqueio.',
    minDelaySec: 4,
    maxDelaySec: 10,
    batchSize: 35,
    batchPauseSec: 90,
    windowStartHour: 7,
    windowEndHour: 22,
  },
  {
    id: '90',
    percent: 90,
    label: '90%',
    title: 'Recomendado',
    description: 'Equilíbrio entre ritmo e segurança no dia a dia.',
    minDelaySec: 12,
    maxDelaySec: 35,
    batchSize: 12,
    batchPauseSec: 240,
    windowStartHour: 8,
    windowEndHour: 20,
  },
  {
    id: '100',
    percent: 100,
    label: '100%',
    title: 'Máximo',
    description: 'Cadência bem conservadora. Mais lento, mais seguro.',
    minDelaySec: 30,
    maxDelaySec: 90,
    batchSize: 5,
    batchPauseSec: 600,
    windowStartHour: 9,
    windowEndHour: 18,
  },
]

export function getAntiBanPreset(id: AntiBanPresetId): AntiBanPreset | null {
  if (id === 'custom') return null
  return ANTI_BAN_PRESETS.find((p) => p.id === id) ?? null
}

export function timingFromPreset(preset: AntiBanPreset): AntiBanTiming {
  return {
    minDelaySec: preset.minDelaySec,
    maxDelaySec: preset.maxDelaySec,
    batchSize: preset.batchSize,
    batchPauseSec: preset.batchPauseSec,
    windowStartHour: preset.windowStartHour,
    windowEndHour: preset.windowEndHour,
  }
}

/** Detecta se os tempos atuais batem com algum preset. */
export function matchAntiBanPreset(timing: AntiBanTiming): AntiBanPresetId {
  for (const p of ANTI_BAN_PRESETS) {
    if (
      p.minDelaySec === timing.minDelaySec &&
      p.maxDelaySec === timing.maxDelaySec &&
      p.batchSize === timing.batchSize &&
      p.batchPauseSec === timing.batchPauseSec &&
      p.windowStartHour === timing.windowStartHour &&
      p.windowEndHour === timing.windowEndHour
    ) {
      return p.id
    }
  }
  return 'custom'
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (s === 0) return `${m} min`
  return `${m}m ${s}s`
}
