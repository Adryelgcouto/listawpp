/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_LISTA_ZAP_WA_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '@/vendor/xlsx.mjs' {
  export function read(
    data: ArrayBuffer | string | Uint8Array,
    opts?: Record<string, unknown>,
  ): {
    SheetNames: string[]
    Sheets: Record<string, Record<string, unknown>>
  }
  export const utils: {
    sheet_to_json: <T = unknown>(
      sheet: Record<string, unknown>,
      opts?: Record<string, unknown>,
    ) => T[]
  }
}
