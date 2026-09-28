// Where the story is saved: IndexedDB, which has room for whole manuscripts.
// Writes are batched (a short pause after the last change) and flushed when
// the page is hidden. Stories saved by older versions in localStorage are
// read once and carried over on the next save.

import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { create } from 'zustand'
import { openDb, request, transactionDone } from './idb'
import { backupOnLoad, saveBackup, type BackupReason } from './backups'

export const STORY_KEY = 'story-builder:story'
const DB_NAME = 'story-builder-data'
const STORE = 'kv'
const WRITE_DELAY_MS = 400

export type SaveStatus = 'saved' | 'saving' | 'error'

/** Save state, for the "Saved" indicator and error banner. */
export const useSaveStatus = create<{ status: SaveStatus }>(() => ({ status: 'saved' }))

let dbPromise: Promise<IDBDatabase> | null = null
const db = () => (dbPromise ??= openDb(DB_NAME, 1, (d) => d.createObjectStore(STORE)))

async function readIdb(name: string): Promise<string | null> {
  try {
    const d = await db()
    const value = await request(d.transaction(STORE).objectStore(STORE).get(name))
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

function readLegacy(name: string): string | null {
  try {
    return localStorage.getItem(name)
  } catch {
    return null
  }
}

async function write(name: string, raw: string): Promise<void> {
  try {
    const d = await db()
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(raw, name)
    await transactionDone(tx)
  } catch {
    // No IndexedDB (rare, e.g. some private modes): fall back to localStorage,
    // which works for smaller stories.
    localStorage.setItem(name, raw)
  }
}

// When the page is hidden or closing, an IndexedDB write can be cut off, so
// the latest unsaved story is also kept here (synchronously) until it lands.
const JOURNAL_KEY = `${STORY_KEY}:unsaved`
let journaled: string | null = null

function writeJournal(name: string, raw: string) {
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify({ name, raw }))
    journaled = raw
  } catch {
    // Too big for localStorage; rely on IndexedDB.
  }
}

function readJournal(name: string): string | null {
  try {
    const j = JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? 'null')
    return j && j.name === name && typeof j.raw === 'string' ? j.raw : null
  } catch {
    return null
  }
}

function clearJournal() {
  journaled = null
  try {
    localStorage.removeItem(JOURNAL_KEY)
  } catch {
    // Nothing to clear.
  }
}

let pending: { name: string; value: StorageValue<unknown> } | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let writing: Promise<void> = Promise.resolve()

/**
 * Writes any change still waiting for the pause after typing. With
 * `journal`, also keeps a synchronous copy in case the page closes first.
 */
export function flushStory(opts: { journal?: boolean } = {}): Promise<void> {
  clearTimeout(timer)
  if (pending) {
    const { name, value } = pending
    pending = null
    const raw = JSON.stringify(value)
    if (opts.journal) writeJournal(name, raw)
    writing = writing
      .then(() => write(name, raw))
      .then(
        () => {
          if (journaled === raw) clearJournal()
          if (!pending) useSaveStatus.setState({ status: 'saved' })
        },
        () => useSaveStatus.setState({ status: 'error' }),
      )
  }
  return writing
}

export function storyStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      // A journal is only left behind when the last write didn't finish, so it's the newest copy.
      const journal = readJournal(name)
      if (journal) {
        try {
          await write(name, journal)
          clearJournal()
        } catch {
          // Keep the journal; it's used again next time.
        }
      }
      const raw = journal ?? (await readIdb(name)) ?? readLegacy(name)
      // Copy the story before the app gets a chance to upgrade or change it.
      await backupOnLoad(raw)
      if (!raw) return null
      try {
        return JSON.parse(raw) as StorageValue<S>
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      pending = { name, value: value as StorageValue<unknown> }
      useSaveStatus.setState({ status: 'saving' })
      clearTimeout(timer)
      timer = setTimeout(() => void flushStory(), WRITE_DELAY_MS)
    },
    removeItem: async (name) => {
      const d = await db()
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(name)
      await transactionDone(tx)
    },
  }
}

/** The saved story as stored (after writing anything pending). */
export async function readSavedStory(): Promise<string | null> {
  await flushStory()
  return (await readIdb(STORY_KEY)) ?? readLegacy(STORY_KEY)
}

/** Copies the saved story now, e.g. before it's replaced. Never throws. */
export async function backupNow(reason: BackupReason = 'before-replace'): Promise<void> {
  try {
    const raw = await readSavedStory()
    if (raw) await saveBackup(raw, reason)
  } catch {
    // Best-effort.
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushStory({ journal: true })
  })
  window.addEventListener('pagehide', () => void flushStory({ journal: true }))
}
