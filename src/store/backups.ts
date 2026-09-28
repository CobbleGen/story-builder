// Automatic copies of the saved story, kept in IndexedDB (separate from the
// story's own localStorage entry, so they don't compete for its space).
// A copy is taken when a new version of the app loads, at most every 12
// hours otherwise, and before the story is replaced. Import this module
// before the story store so the copy on load predates any upgrade.

export const STORY_KEY = 'story-builder:story'
const DB_NAME = 'story-builder-backups'
const STORE = 'snapshots'
const KEEP = 30
const PERIOD_MS = 12 * 60 * 60 * 1000

export type BackupReason = 'new-version' | 'periodic' | 'before-replace'

export interface Backup {
  id: number
  at: number
  build: string
  reason: BackupReason
  /** The story as saved: zustand's `{state, version}` JSON. */
  raw: string
}

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORY_KEY)
  } catch {
    return null
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function listBackups(): Promise<Backup[]> {
  try {
    const db = await openDb()
    const all = await request(db.transaction(STORE).objectStore(STORE).getAll() as IDBRequest<Backup[]>)
    db.close()
    return all.sort((a, b) => b.id - a.id)
  } catch {
    return []
  }
}

async function save(raw: string, reason: BackupReason): Promise<void> {
  const db = await openDb()
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  const now = Date.now()
  await request(store.put({ id: now, at: now, build: __BUILD_ID__, reason, raw } satisfies Backup))
  const keys = (await request(store.getAllKeys())) as number[]
  for (const key of keys.sort((a, b) => b - a).slice(KEEP)) await request(store.delete(key))
  db.close()
}

/** Copies the saved story now (before replacing it). Never throws. */
export async function backupNow(reason: BackupReason = 'before-replace'): Promise<void> {
  const raw = readSaved()
  if (!raw) return
  try {
    await save(raw, reason)
  } catch {
    // Backups are best-effort; the story itself is unaffected.
  }
}

async function backupOnLoad(raw: string | null): Promise<void> {
  if (!raw) return
  try {
    const [latest] = await listBackups()
    if (latest?.raw === raw) return
    if (!latest || latest.build !== __BUILD_ID__) await save(raw, 'new-version')
    else if (Date.now() - latest.at > PERIOD_MS) await save(raw, 'periodic')
  } catch {
    // Best-effort, as above.
  }
}

// Read the saved story synchronously, before the store loads and upgrades it.
void backupOnLoad(readSaved())
