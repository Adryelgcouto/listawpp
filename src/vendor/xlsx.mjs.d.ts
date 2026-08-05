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
