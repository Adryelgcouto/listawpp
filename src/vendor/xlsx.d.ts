/** Tipagem mínima do SheetJS vendored (xlsx.mjs). */
export function read(
  data: ArrayBuffer | string | Uint8Array,
  opts?: Record<string, unknown>,
): WorkBook

export const utils: {
  sheet_to_json: <T = unknown>(
    sheet: WorkSheet,
    opts?: Record<string, unknown>,
  ) => T[]
}

export interface WorkBook {
  SheetNames: string[]
  Sheets: Record<string, WorkSheet>
}

export type WorkSheet = Record<string, unknown>
