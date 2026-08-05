import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * C2 — wipe deve zerar chaves de storage.
 */
describe('hardWipe storage keys', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size
      },
    })
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    })
  })

  it('wipeLocalStorageKeys removes known keys', async () => {
    const { wipeLocalStorageKeys } = await import('./security')
    localStorage.setItem('lista-zap-clients', '{"clients":[]}')
    localStorage.setItem('lista-zap-settings', '{}')
    localStorage.setItem('lista-zap-queue', '{}')
    localStorage.setItem('lista-zap-auth', '{}')
    wipeLocalStorageKeys()
    expect(localStorage.getItem('lista-zap-clients')).toBeNull()
    expect(localStorage.getItem('lista-zap-settings')).toBeNull()
    expect(localStorage.getItem('lista-zap-queue')).toBeNull()
    expect(localStorage.getItem('lista-zap-auth')).toBeNull()
  })
})
