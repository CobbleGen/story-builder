// Automatic copies of the saved story, kept in their own IndexedDB database.
// A copy is taken when a new version of the app loads (before the store
// upgrades the story), at most every 12 hours otherwise, and before the
// story is replaced.

import { openDb, request, transactionDone } from './idb'

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

const open = () => openDb(DB_NAME, 1, (db) => db.createObjectStore(STORE, { keyPath: 'id' }))

export async function listBackups(): Promise<Backup[]> {
  try {
    const db = await open()
    const all = await request(db.transaction(STORE).objectStore(STORE).getAll() as IDBRequest<Backup[]>)
    db.close()
    return all.sort((a, b) => b.id - a.id)
  } catch {
    return []
  }
}

export async function saveBackup(raw: string, reason: BackupReason): Promise<void> {
  const db = await open()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const now = Date.now()
    store.put({ id: now, at: now, build: __BUILD_ID__, reason, raw } satisfies Backup)
    const keys = (await request(store.getAllKeys())) as number[]
    for (const key of keys.sort((a, b) => b - a).slice(KEEP)) store.delete(key)
    await transactionDone(tx)
  } finally {
    db.close()
  }
}

/** Called with the saved story as it's loaded, before anything can change it. Never throws. */
export async function backupOnLoad(raw: string | null): Promise<void> {
  if (!raw) return
  try {
    const [latest] = await listBackups()
    if (latest?.raw === raw) return
    if (!latest || latest.build !== __BUILD_ID__) await saveBackup(raw, 'new-version')
    else if (Date.now() - latest.at > PERIOD_MS) await saveBackup(raw, 'periodic')
  } catch {
    // Backups are best-effort; the story itself is unaffected.
  }
}
