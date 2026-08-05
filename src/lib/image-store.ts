/** H5: imagem comercial em IndexedDB (não estoura localStorage). */

const DB_NAME = 'lista-zap-media'
const STORE = 'images'
const KEY = 'commercial'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveCommercialImage(dataUrl: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(dataUrl, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadCommercialImage(): Promise<string | null> {
  try {
    const db = await openDb()
    const value = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as string) ?? null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return value
  } catch {
    return null
  }
}

export async function clearCommercialImage(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    /* ignore */
  }
}

/** Redimensiona imagem para caber ~600KB em dataURL. */
export async function compressImageFile(
  file: File,
  maxEdge = 1280,
  quality = 0.82,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Arquivo não é imagem')
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Imagem muito grande (máx. 8MB de entrada)')
  }

  const bitmap = await createImageBitmap(file)
  let { width, height } = bitmap
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  width = Math.round(width * scale)
  height = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  // se ainda grande, baixa qualidade
  if (dataUrl.length > 800_000) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.65)
  }
  if (dataUrl.length > 900_000) {
    throw new Error('Imagem ainda grande demais após compressão')
  }
  return dataUrl
}
