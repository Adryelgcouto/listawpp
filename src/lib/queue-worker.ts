import { sendMedia, sendText, EvolutionError } from './evolution'
import { rewriteMessage } from './gemini'
import {
  assertSafeOutboundText,
  maskNameForLog,
  maskPhoneForLog,
  safeMessagePreview,
  sanitizeErrorMessage,
  sanitizeLogLine,
  sanitizePersonName,
} from './security'
import { hasServerWaApi, serverWaSend } from './wa-server'
import { registerWipeStopWorker } from './wipe'
import { useClientsStore } from '@/stores/clients'
import { useQueueStore } from '@/stores/queue'
import { useSettingsStore } from '@/stores/settings'

let loopAbort = false
let loopRunning = false
let wakeResolver: (() => void) | null = null

function sleep(ms: number, signal?: { aborted: boolean }) {
  return new Promise<void>((resolve) => {
    const start = Date.now()
    const tick = () => {
      if (signal?.aborted || loopAbort) {
        resolve()
        return
      }
      if (Date.now() - start >= ms) {
        resolve()
        return
      }
      setTimeout(tick, Math.min(250, ms - (Date.now() - start)))
    }
    tick()
  })
}

function randomDelayMs(minSec: number, maxSec: number, demo: boolean) {
  const min = demo ? Math.min(minSec, 1) : minSec
  const max = demo ? Math.min(maxSec, 3) : maxSec
  const lo = Math.max(0.3, Math.min(min, max))
  const hi = Math.max(lo, max)
  return (lo + Math.random() * (hi - lo)) * 1000
}

function withinSendWindow(startH: number, endH: number): boolean {
  const h = new Date().getHours()
  if (startH === endH) return true
  if (startH < endH) return h >= startH && h < endH
  return h >= startH || h < endH
}

function safeLog(
  level: 'info' | 'success' | 'warn' | 'error',
  message: string,
  itemId?: string,
) {
  useQueueStore.getState().addLog(level, sanitizeLogLine(message), itemId)
}

export function requestQueueWake() {
  if (wakeResolver) {
    const r = wakeResolver
    wakeResolver = null
    r()
  }
}

export function stopQueueWorker() {
  loopAbort = true
  requestQueueWake()
  useQueueStore.getState().setRunning(false)
  useQueueStore.getState().setPaused(false)
}

export function pauseQueueWorker() {
  useQueueStore.getState().setPaused(true)
  useQueueStore.getState().setRunning(false)
  requestQueueWake()
}

registerWipeStopWorker(stopQueueWorker)

export async function startQueueWorker() {
  const q = useQueueStore.getState()
  q.setRunning(true)
  q.setPaused(false)
  loopAbort = false
  if (loopRunning) {
    requestQueueWake()
    return
  }
  loopRunning = true
  safeLog('info', 'Fila iniciada')

  try {
    while (!loopAbort) {
      const state = useQueueStore.getState()
      if (!state.running || state.paused) {
        await waitOrAbort()
        continue
      }

      const settings = useSettingsStore.getState()

      if (
        !settings.demoMode &&
        !withinSendWindow(settings.windowStartHour, settings.windowEndHour)
      ) {
        safeLog(
          'warn',
          `Fora da janela de envio (${settings.windowStartHour}h–${settings.windowEndHour}h). Pausado.`,
        )
        pauseQueueWorker()
        continue
      }

      if (
        !settings.demoMode &&
        settings.batchSize > 0 &&
        state.lastBatchCount >= settings.batchSize
      ) {
        safeLog(
          'info',
          `Lote de ${settings.batchSize} atingido — pausa de ${settings.batchPauseSec}s`,
        )
        await sleep(settings.batchPauseSec * 1000, { aborted: loopAbort })
        useQueueStore.getState().resetBatch()
        if (loopAbort || !useQueueStore.getState().running) continue
      }

      const item = useQueueStore.getState().claimNextPending()
      if (!item) {
        safeLog('success', 'Fila sem pendentes — concluída')
        useQueueStore.getState().setRunning(false)
        break
      }

      const who = maskNameForLog(item.name)
      const phoneMask = maskPhoneForLog(item.phone)
      safeLog('info', `Enviando · ${who} (${phoneMask})…`, item.id)

      try {
        const msgRaw = await rewriteMessage({
          apiKey: settings.geminiApiKey,
          model: settings.geminiModel,
          template: settings.messageTemplate,
          nome: sanitizePersonName(item.name),
          seed: item.attempts + item.phone.length,
          useGemini: settings.useGeminiRewrite,
          forceDemo: settings.demoMode,
        })
        const message = assertSafeOutboundText(msgRaw, 'mensagem WhatsApp')

        if (settings.demoMode) {
          await sleep(400 + Math.random() * 600, { aborted: loopAbort })
        } else if (hasServerWaApi()) {
          // Produção Vercel: chave fica no servidor (/api/wa/send)
          const image =
            settings.sendImage && settings.commercialImageDataUrl
              ? settings.commercialImageDataUrl
              : null
          await serverWaSend({
            number: item.phone,
            text: message,
            mediaDataUrl: image,
          })
        } else {
          const image =
            settings.sendImage && settings.commercialImageDataUrl
              ? settings.commercialImageDataUrl
              : null
          if (image) {
            await sendMedia({
              url: settings.evolutionUrl,
              apiKey: settings.evolutionApiKey,
              instance: settings.evolutionInstance,
              number: item.phone,
              caption: message,
              mediaDataUrl: image,
            })
          } else {
            await sendText({
              url: settings.evolutionUrl,
              apiKey: settings.evolutionApiKey,
              instance: settings.evolutionInstance,
              number: item.phone,
              text: message,
            })
          }
        }

        useQueueStore.getState().updateItem(item.id, {
          status: 'sent',
          messagePreview: safeMessagePreview(message),
          sentAt: new Date().toISOString(),
          error: undefined,
        })
        useQueueStore.getState().bumpSentToday()
        useQueueStore.getState().bumpBatch()
        useClientsStore.getState().markValidatedByPhone(item.phone)
        safeLog('success', `Enviado · ${who}`, item.id)
      } catch (err) {
        const evo =
          err instanceof EvolutionError
            ? err
            : null
        const msg = sanitizeErrorMessage(
          err instanceof Error ? err.message : String(err),
        )

        // M4: circuit breaker — config/cors aborta a fila inteira
        if (evo && (evo.kind === 'config' || evo.kind === 'cors')) {
          useQueueStore.getState().updateItem(item.id, {
            status: 'pending',
            error: undefined,
          })
          safeLog(
            'error',
            `Infra: ${msg} — fila pausada (clientes não marcados como falha)`,
            item.id,
          )
          pauseQueueWorker()
          break
        }

        useQueueStore.getState().updateItem(item.id, {
          status: 'failed',
          error: msg,
        })
        useClientsStore.getState().markFailedByPhone(item.phone)
        safeLog('error', `Falha · ${who}: ${msg}`, item.id)
      }

      if (loopAbort || !useQueueStore.getState().running) continue

      const delay = randomDelayMs(
        settings.minDelaySec,
        settings.maxDelaySec,
        settings.demoMode,
      )
      safeLog('info', `Aguardando ${Math.round(delay / 1000)}s…`)
      await sleep(delay, { aborted: loopAbort })
    }
  } finally {
    loopRunning = false
    if (!useQueueStore.getState().paused) {
      useQueueStore.getState().setRunning(false)
    }
  }
}

function waitOrAbort() {
  return new Promise<void>((resolve) => {
    wakeResolver = () => resolve()
    setTimeout(() => {
      if (wakeResolver) {
        wakeResolver = null
        resolve()
      }
    }, 2000)
  })
}
