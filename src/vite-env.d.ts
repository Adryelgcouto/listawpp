/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_LISTA_ZAP_WA_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
