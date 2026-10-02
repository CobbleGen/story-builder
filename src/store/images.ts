// Pictures live in their own IndexedDB database, by id. The story only holds
// their ids (in mind map cards and the manuscript), so it stays small: it's
// saved whole after every pause in typing, journaled to localStorage and
// copied into backups, none of which should carry megabytes of photos.

import { useEffect, useSyncExternalStore } from 'react'
import { openDb, request, transactionDone } from './idb'
import { IMAGE_ID } from '../lib/id'

export { IMAGE_ID }

export interface StoredImage {
  id: string
  blob: Blob
  type: string
  width: number
  height: number
  /** The file it came from, for reference. */
  name: string
  addedAt: number
}

const DB_NAME = 'story-builder-images'
const STORE = 'images'

const IMAGE_IDS = /img_[a-z0-9]+/g

let dbPromise: Promise<IDBDatabase> | null = null
const db = () => (dbPromise ??= openDb(DB_NAME, 1, (d) => d.createObjectStore(STORE, { keyPath: 'id' })))

export async function putImage(image: StoredImage): Promise<void> {
  const tx = (await db()).transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(image)
  await transactionDone(tx)
  // Show it straight away.
  setUrl(image.id, URL.createObjectURL(image.blob))
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  try {
    return (await request((await db()).transaction(STORE).objectStore(STORE).get(id))) as StoredImage | undefined
  } catch {
    return undefined
  }
}

// ---------- Showing pictures ----------

// id -> object URL (null: no such picture). Absent while it hasn't loaded.
const urls = new Map<string, string | null>()
const loading = new Set<string>()
const listeners = new Set<() => void>()

function setUrl(id: string, url: string | null) {
  const old = urls.get(id)
  if (old) URL.revokeObjectURL(old)
  urls.set(id, url)
  listeners.forEach((l) => l())
}

function load(id: string) {
  if (urls.has(id) || loading.has(id)) return
  loading.add(id)
  void getImage(id).then((image) => {
    loading.delete(id)
    if (!urls.has(id)) setUrl(id, image ? URL.createObjectURL(image.blob) : null)
  })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A stored picture's URL to show it: undefined while loading, null if it's missing. */
export function useImageUrl(id: string | null | undefined): string | null | undefined {
  const url = useSyncExternalStore(subscribe, () => (id ? urls.get(id) : null))
  useEffect(() => {
    if (id) load(id)
  }, [id])
  return url
}

// ---------- Copying pictures with the story ----------

/** Every picture id the story (as saved text) refers to. */
export const imageIdsIn = (raw: string): string[] => [...new Set(raw.match(IMAGE_IDS) ?? [])]

export interface PortableImage {
  type: string
  width: number
  height: number
  name: string
  /** A data: URL. */
  data: string
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** The pictures a story uses, as text, to save inside an exported story file. */
export async function exportImages(ids: string[]): Promise<Record<string, PortableImage>> {
  const out: Record<string, PortableImage> = {}
  for (const id of ids) {
    const image = await getImage(id)
    if (image) out[id] = { type: image.type, width: image.width, height: image.height, name: image.name, data: await blobToDataUrl(image.blob) }
  }
  return out
}

function fromDataUrl(data: string): Blob | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(data)
  if (!m) return null
  const bytes = m[2] ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[3]))
  return new Blob([bytes], { type: m[1] || 'application/octet-stream' })
}

/** Stores the pictures from an imported story file. Bad entries are skipped. */
export async function importImages(images: unknown): Promise<void> {
  if (typeof images !== 'object' || images === null) return
  for (const [id, value] of Object.entries(images as Record<string, unknown>)) {
    const v = value as Partial<PortableImage> | null
    if (!IMAGE_ID.test(id) || !v || typeof v.data !== 'string' || !v.data.startsWith('data:image/')) continue
    const blob = fromDataUrl(v.data)
    if (!blob) continue
    await putImage({
      id,
      blob,
      type: blob.type,
      width: Number(v.width) || 800,
      height: Number(v.height) || 600,
      name: typeof v.name === 'string' ? v.name : '',
      addedAt: Date.now(),
    })
  }
}

// ---------- Tidying up ----------

const DAY = 24 * 60 * 60 * 1000

/**
 * Deletes pictures nothing refers to any more: not the story, its backups or
 * the undo history (`keep` gives them as text). Pictures added in the last
 * day stay regardless, in case they're about to be used.
 */
export async function pruneImages(keep: () => Promise<string[]>): Promise<number> {
  const d = await db()
  const all = (await request(d.transaction(STORE).objectStore(STORE).getAll())) as StoredImage[]
  const old = all.filter((image) => Date.now() - image.addedAt > DAY)
  if (!old.length) return 0
  const used = new Set((await keep()).flatMap((raw) => raw.match(IMAGE_IDS) ?? []))
  const stale = old.filter((image) => !used.has(image.id))
  if (!stale.length) return 0
  const tx = d.transaction(STORE, 'readwrite')
  for (const image of stale) tx.objectStore(STORE).delete(image.id)
  await transactionDone(tx)
  return stale.length
}
