/**
 * Segurança de dados sensíveis — Lista Zap
 * Ondas 0–3 do SECURITY-REVIEW-ADVERSARIAL.md
 */
import { stripCpfFromText, containsCpfPattern } from './cpf'

const API_KEYISH =
  /\b(AIza[0-9A-Za-z\-_]{20,}|sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9\-._~+/]+=*)\b/gi
const LONG_BASE64 = /data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=\s]{40,}/g

/** Secrets conhecidos em runtime (API keys digitadas) para redação por valor. */
const runtimeSecrets = new Set<string>()

export function registerRuntimeSecret(value: string | null | undefined) {
  const v = (value || '').trim()
  if (v.length >= 8) runtimeSecrets.add(v)
}

export function clearRuntimeSecrets() {
  runtimeSecrets.clear()
}

export function stripCpfEverywhere(text: string): string {
  return stripCpfFromText(text)
}

export function containsCpf(text: string): boolean {
  return containsCpfPattern(text)
}

export function maskPhoneForLog(phone: string): string {
  const d = (phone || '').replace(/\D/g, '')
  if (!d) return '***'
  if (d.length >= 12 && d.startsWith('55')) {
    const local = d.slice(2)
    const ddd = local.slice(0, 2)
    const last = local.slice(-4)
    return `+55 (${ddd}) *****-${last}`
  }
  if (d.length >= 8) return `***${d.slice(-4)}`
  return '***'
}

/** Iniciais apenas — L1 */
export function maskNameForLog(name: string): string {
  const n = (name || '').trim()
  if (!n) return 'Cliente'
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return `${parts[0]!.charAt(0)}.`
  return `${parts[0]!.charAt(0)}.${parts[parts.length - 1]!.charAt(0)}.`
}

function redactKnownSecrets(s: string): string {
  let out = s
  for (const secret of runtimeSecrets) {
    if (secret && out.includes(secret)) {
      out = out.split(secret).join('[secret]')
    }
  }
  return out
}

/** Remove secrets, CPF e blobs base64 de mensagens de erro/log. L3: phone antes de CPF. */
export function sanitizeErrorMessage(raw: string, maxLen = 180): string {
  let s = String(raw ?? '')
  s = s.replace(LONG_BASE64, '[imagem]')
  s = redactKnownSecrets(s)
  s = s.replace(API_KEYISH, '[secret]')
  // telefone primeiro
  s = s.replace(/\b\d{10,13}\b/g, (m) => maskPhoneForLog(m))
  s = stripCpfEverywhere(s)
  // log é sempre 1 linha (stripCpf agora preserva \n de propósito)
  s = s.replace(/\s+/g, ' ').trim()
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`
  return s
}

export function sanitizeLogLine(message: string): string {
  return sanitizeErrorMessage(message, 220)
}

/** Preview na fila — mostra quase o texto inteiro (máx 500). */
export function safeMessagePreview(text: string, max = 500): string {
  const clean = stripCpfEverywhere(text)
  if (clean.length <= max) return clean
  return `${clean.slice(0, max)}…`
}

export function assertSafeOutboundText(text: string, context: string): string {
  const clean = stripCpfEverywhere(text)
  if (containsCpf(clean)) {
    throw new Error(
      `Bloqueado: possível CPF em ${context}. Mensagem não enviada.`,
    )
  }
  if (/AIza[0-9A-Za-z\-_]{20,}|sk-[A-Za-z0-9]{20,}/i.test(clean)) {
    throw new Error(`Bloqueado: possível secret em ${context}.`)
  }
  for (const secret of runtimeSecrets) {
    if (secret && clean.includes(secret)) {
      throw new Error(`Bloqueado: possível secret em ${context}.`)
    }
  }
  return clean
}

/** Sanitiza nome na ingestão — remove CPF colado pelo OCR (C1). Nome é sempre 1 linha. */
export function sanitizePersonName(name: string): string {
  return stripCpfEverywhere(name || '')
    .replace(/\[cpf-removido\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── PIN crypto ───────────────────────────────────────────

export async function hashPin(pin: string, saltB64: string): Promise<string> {
  const enc = new TextEncoder()
  const saltBytes = b64ToBytes(saltB64)
  const salt = saltBytes.buffer.slice(
    saltBytes.byteOffset,
    saltBytes.byteOffset + saltBytes.byteLength,
  ) as ArrayBuffer
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 120_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  )
  return bytesToB64(new Uint8Array(bits))
}

export function createSalt(): string {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(16)))
}

export async function verifyPin(
  pin: string,
  saltB64: string,
  expectedHashB64: string,
): Promise<boolean> {
  if (!pin || !saltB64 || !expectedHashB64) return false
  const got = await hashPin(pin, saltB64)
  return timingSafeEqualB64(got, expectedHashB64)
}

function timingSafeEqualB64(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach((b) => {
    s += String.fromCharCode(b)
  })
  return btoa(s)
}

export function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** Deriva AES-GCM key do PIN (H3). */
export async function deriveAesKey(
  pin: string,
  saltB64: string,
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const saltBytes = b64ToBytes(saltB64)
  const salt = saltBytes.buffer.slice(
    saltBytes.byteOffset,
    saltBytes.byteOffset + saltBytes.byteLength,
  ) as ArrayBuffer
  const base = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptJson(
  key: CryptoKey,
  data: unknown,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  const packed = new Uint8Array(iv.length + cipher.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(cipher), iv.length)
  return bytesToB64(packed)
}

export async function decryptJson<T>(
  key: CryptoKey,
  packedB64: string,
): Promise<T> {
  const packed = b64ToBytes(packedB64)
  const iv = packed.slice(0, 12)
  const data = packed.slice(12)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  )
  return JSON.parse(new TextDecoder().decode(plain)) as T
}

const STORAGE_KEYS = [
  'lista-zap-clients',
  'lista-zap-queue',
  'lista-zap-settings',
  'lista-zap-auth',
  'lista-zap-clients-enc',
  'lista-zap-settings-enc',
  'lista-zap-image-meta',
] as const

/** Só limpa chaves de storage — stores em memória devem ser resetados pelo caller (C2). */
export function wipeLocalStorageKeys(): void {
  for (const k of STORAGE_KEYS) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
  try {
    sessionStorage.removeItem('lista-zap-unlocked')
    sessionStorage.removeItem('lista-zap-enc-session')
  } catch {
    /* ignore */
  }
  clearRuntimeSecrets()
}

/** @deprecated use wipeLocalStorageKeys + store resets */
export function wipeLocalAppData(): void {
  wipeLocalStorageKeys()
}

/** Hosts privados/LAN — HTTP permitido (Evolution local na rede). */
function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h.endsWith('.local')
  ) {
    return true
  }
  // IPv4 private
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 10) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 127) return true
  }
  return false
}

/**
 * M6: HTTPS sempre ok.
 * HTTP só em loopback / LAN privada (Evolution em casa/servidor local).
 * HTTP público bloqueado (apikey em claro na internet).
 */
export function isSafeEvolutionUrl(url: string): {
  ok: boolean
  reason?: string
} {
  const u = (url || '').trim()
  if (!u) return { ok: false, reason: 'URL vazia' }
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return { ok: false, reason: 'URL inválida' }
  }
  if (parsed.protocol === 'https:') return { ok: true }
  if (parsed.protocol === 'http:') {
    if (isPrivateOrLocalHost(parsed.hostname)) return { ok: true }
    return {
      ok: false,
      reason:
        'HTTP público bloqueado — use HTTPS, ou HTTP só em localhost/LAN (192.168.x.x).',
    }
  }
  return { ok: false, reason: 'Protocolo não suportado (use http/https)' }
}
