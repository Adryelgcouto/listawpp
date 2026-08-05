import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  getAntiBanPreset,
  matchAntiBanPreset,
  timingFromPreset,
} from '@/lib/anti-ban'
import {
  isSafeEvolutionUrl,
  registerRuntimeSecret,
} from '@/lib/security'
import { SettingsPersistSchema, safeParsePersist } from '@/lib/schemas'
import {
  DEFAULT_SETTINGS,
  type AntiBanPresetId,
  type Settings,
} from '@/types'

interface SettingsState extends Settings {
  setSettings: (patch: Partial<Settings>) => void
  applyAntiBanPreset: (id: Exclude<AntiBanPresetId, 'custom'>) => void
  setAntiBanTiming: (
    patch: Partial<
      Pick<
        Settings,
        | 'minDelaySec'
        | 'maxDelaySec'
        | 'batchSize'
        | 'batchPauseSec'
        | 'windowStartHour'
        | 'windowEndHour'
      >
    >,
  ) => void
  resetSettings: () => void
}

function registerSecretsFrom(s: Settings) {
  registerRuntimeSecret(s.evolutionApiKey)
  registerRuntimeSecret(s.geminiApiKey)
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      setSettings: (patch) => {
        // M6: bloquear URL http remota
        if (patch.evolutionUrl !== undefined) {
          const check = isSafeEvolutionUrl(patch.evolutionUrl)
          if (!check.ok && patch.evolutionUrl.trim()) {
            // ainda salva mas caller deve avisar; enforce no evoFetch
          }
        }
        // H5: NÃO persistir dataURL grande no settings — só flag
        const safe = { ...patch }
        if ('commercialImageDataUrl' in safe && safe.commercialImageDataUrl) {
          // mantém em memória; partialize zera
        }
        set((s) => {
          const next = { ...s, ...safe }
          registerSecretsFrom(next)
          return next
        })
      },

      applyAntiBanPreset: (id) => {
        const preset = getAntiBanPreset(id)
        if (!preset) return
        set({
          antiBanPreset: id,
          ...timingFromPreset(preset),
        })
      },

      setAntiBanTiming: (patch) => {
        const next = { ...get(), ...patch }
        const matched = matchAntiBanPreset({
          minDelaySec: next.minDelaySec,
          maxDelaySec: next.maxDelaySec,
          batchSize: next.batchSize,
          batchPauseSec: next.batchPauseSec,
          windowStartHour: next.windowStartHour,
          windowEndHour: next.windowEndHour,
        })
        set({ ...patch, antiBanPreset: matched })
      },

      resetSettings: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'lista-zap-settings',
      partialize: (s) => ({
        demoMode: s.demoMode,
        evolutionUrl: s.evolutionUrl,
        evolutionApiKey: s.evolutionApiKey,
        evolutionInstance: s.evolutionInstance,
        geminiApiKey: s.geminiApiKey,
        geminiModel: s.geminiModel,
        messageTemplate: s.messageTemplate,
        antiBanPreset: s.antiBanPreset,
        minDelaySec: s.minDelaySec,
        maxDelaySec: s.maxDelaySec,
        batchSize: s.batchSize,
        batchPauseSec: s.batchPauseSec,
        windowStartHour: s.windowStartHour,
        windowEndHour: s.windowEndHour,
        allowOutsideWindow: s.allowOutsideWindow,
        sendImage: s.sendImage,
        useGeminiRewrite: s.useGeminiRewrite,
        // H5: nunca persistir imagem base64 no localStorage
        commercialImageDataUrl: null as string | null,
      }),
      merge: (persisted, current) => {
        const p = safeParsePersist(
          SettingsPersistSchema,
          persisted ?? {},
          {},
        )
        const merged = {
          ...current,
          ...p,
          commercialImageDataUrl: null as string | null,
        } as SettingsState
        // H2: default rewrite agora opt-in se não definido no persist antigo
        if (p.useGeminiRewrite === undefined) {
          merged.useGeminiRewrite = false
        }
        registerSecretsFrom(merged)
        return merged
      },
    },
  ),
)
