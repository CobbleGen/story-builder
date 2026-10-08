import { createStore } from 'zustand/vanilla'
import type { StoryData } from '../types'
import { CloudError, isOffline, type AuthEvent, type CloudBackend, type CloudStoryRow, type CloudUser } from './backend'
import { keyHash, newKey } from './assistantKeys'

// Keeping the story in this browser in step with one in the writer's account.
// The browser's copy is the one worked on (it works offline, as before); a
// few seconds after a change it's saved to the account, over the version it
// was last the same as. If the account's copy moved on meanwhile (saved from
// another device), nothing is overwritten: the writer picks which to keep.
// Changes made elsewhere are picked up when the app comes back into view.

export type CloudStatus =
  /** No backend set up for this build. */
  | 'off'
  | 'signed-out'
  | 'connecting'
  | 'synced'
  | 'saving'
  /** Couldn't reach the account; tries again. */
  | 'offline'
  /** Changed here and in the account since they were last the same. */
  | 'conflict'
  /** Signed in, but this browser's story isn't one in the account: the writer chooses what to open. */
  | 'unlinked'
  | 'error'

export interface CloudState {
  status: CloudStatus
  user: CloudUser | null
  /** The account story this browser's story is kept in step with. */
  storyId: string | null
  /** Changed here since last saved to the account. */
  pending: boolean
  /** The stories in the account, as last listed. */
  stories: CloudStoryRow[] | null
  /** When the story was last saved to (or loaded from) the account. */
  savedAt: number | null
  error: string | null
  /** Something to tell the writer that isn't a failure (back from an email link, say). */
  notice: string | null
  /** Came from a password reset email: a new password is to be chosen. */
  recovering: boolean
}

/** This browser's story, as kept in step with one in an account. */
export interface Link {
  userId: string
  storyId: string
  /** The account story's version this browser's story was last the same as. */
  version: number
  /** Changed here since. */
  dirty: boolean
}

/** The story being worked on, as the engine sees it. */
export interface StoryPort {
  read(): StoryData
  /** A story from anywhere as the app would load it. */
  prepare(data: unknown): StoryData
  /** Replaces the story (not a change made here, and not one to undo). */
  load(data: StoryData): void
  /** Calls back on every change made to the story (not on loads). */
  subscribe(onChange: () => void): () => void
  /** Keeps a backup of the story as it is (or of `data`), before it's replaced. */
  backup(data?: StoryData): Promise<void>
}

export interface PicturePort {
  /** The pictures a story uses. */
  idsIn(data: StoryData): string[]
  get(id: string): Promise<Blob | undefined>
}

export interface LinkStore {
  read(): Link | null
  write(link: Link | null): void
}

export interface CloudDeps {
  /** Loaded when first needed (it's a large download). */
  backend: () => Promise<CloudBackend>
  story: StoryPort
  pictures: PicturePort
  links: LinkStore
  /** How long after the last change to save; saved at least every `maxWait` while changes keep coming. */
  saveDelay?: number
  maxWait?: number
  /** How long to wait before trying again when the account couldn't be reached. */
  retryDelay?: number
}

const BLOCKED: CloudStatus[] = ['off', 'signed-out', 'connecting', 'conflict', 'unlinked']

export function createCloud(deps: CloudDeps) {
  const { story, pictures, links, saveDelay = 3000, maxWait = 20000, retryDelay = 15000 } = deps
  let link = links.read()
  const store = createStore<CloudState>(() => ({
    status: 'signed-out',
    user: null,
    storyId: link?.storyId ?? null,
    pending: link?.dirty ?? false,
    stories: null,
    savedAt: null,
    error: null,
    notice: null,
    recovering: false,
  }))
  const set = (patch: Partial<CloudState>) => store.setState(patch)
  const state = () => store.getState()

  let backend: CloudBackend | null = null
  let loadingBackend: Promise<CloudBackend> | null = null
  /** Changes made here, counted, to tell whether more came while saving. */
  let changes = 0
  let loading = false
  let uploaded: Set<string> | null = null
  let uploading = false
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let waitingSince: number | null = null
  let unsubscribe: (() => void) | null = null
  let heardBack: () => void = () => {}
  /** Settles once the backend has said whether the writer is signed in. */
  const ready = new Promise<void>((resolve) => (heardBack = resolve))

  // One thing at a time with the account: saving, checking, opening.
  let queue: Promise<unknown> = Promise.resolve()
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => {})
    return run
  }

  function setLink(next: Link | null) {
    link = next
    links.write(next)
    set({ storyId: next?.storyId ?? null, pending: next?.dirty ?? false })
  }

  const user = () => state().user
  const need = () => {
    if (!backend) throw new CloudError('Not connected to your account.')
    return backend
  }

  function ensureBackend(): Promise<CloudBackend> {
    if (backend) return Promise.resolve(backend)
    loadingBackend ??= deps.backend().then((b) => {
      backend = b
      b.onAuthChange(onAuth)
      return b
    })
    return loadingBackend
  }

  function onAuth(event: AuthEvent, signedIn: CloudUser | null) {
    heardBack()
    if (event === 'password-recovery') set({ recovering: true })
    if (!signedIn) {
      clearTimeout(saveTimer)
      set({ user: null, status: 'signed-out', stories: null, savedAt: null, error: null })
      return
    }
    // The same account again (a refreshed sign-in): carry on.
    if (user()?.id === signedIn.id && state().status !== 'signed-out') return set({ user: signedIn })
    void serial(() => connect(signedIn))
  }

  /** Signed in: carry on with the story this browser keeps in step, or find out what to do with it. */
  async function connect(signedIn: CloudUser) {
    set({ user: signedIn, status: 'connecting', error: null, notice: null })
    uploaded = null
    try {
      if (link && link.userId !== signedIn.id) setLink(null)
      if (link) {
        set({ status: 'synced' })
        return await check()
      }
      const stories = await need().listStories()
      set({ stories })
      // A new account: this browser's story becomes its first.
      if (!stories.length) return await addThis()
      set({ status: 'unlinked' })
    } catch (error) {
      trouble(error)
    }
  }

  function onLocalChange() {
    if (loading) return
    changes++
    if (!link) return
    if (!link.dirty) setLink({ ...link, dirty: true })
    scheduleSave()
  }

  function scheduleSave(delay = saveDelay) {
    clearTimeout(saveTimer)
    waitingSince ??= Date.now()
    const wait = Math.max(0, Math.min(delay, waitingSince + maxWait - Date.now()))
    saveTimer = setTimeout(() => void serial(save), wait)
  }

  /** Saves this browser's story to the account, over the version it was last the same as. */
  async function save() {
    clearTimeout(saveTimer)
    waitingSince = null
    const signedIn = user()
    const target = link
    if (!backend || !signedIn || !target?.dirty || BLOCKED.includes(state().status)) return
    const data = story.read()
    const at = changes
    set({ status: 'saving' })
    try {
      const row = await backend.saveStory(target.storyId, data.title, data, target.version)
      if (!row) return await changedElsewhere(target)
      setLink({ ...target, version: row.version, dirty: changes !== at })
      set({ status: 'synced', savedAt: Date.now(), error: null })
      if (changes !== at) scheduleSave()
      void uploadPictures(signedIn, data)
    } catch (error) {
      trouble(error)
    }
  }

  /** A save found the account's copy changed since: saved elsewhere meanwhile, or deleted. */
  async function changedElsewhere(target: Link) {
    const version = await need().getVersion(target.storyId)
    if (version !== null) return set({ status: 'conflict' })
    await unlink()
  }

  async function unlink() {
    setLink(null)
    set({ status: 'unlinked', stories: await need().listStories() })
  }

  /** Whether the account's copy moved on: picks it up, or saves this one, or (both changed) asks. */
  async function check() {
    const signedIn = user()
    const target = link
    if (!backend || !signedIn || !target || BLOCKED.includes(state().status)) return
    try {
      const version = await backend.getVersion(target.storyId)
      if (version === null) return await unlink()
      if (version > target.version) return target.dirty ? set({ status: 'conflict' }) : await pull(target.storyId)
      if (target.dirty) return await save()
      set({ status: 'synced', error: null })
    } catch (error) {
      trouble(error)
    }
  }

  /** Replaces this browser's story with the account's copy. */
  async function pull(id: string) {
    const signedIn = user()!
    const at = changes
    const found = await need().getStory(id)
    if (!found) return await unlink()
    // Changed here while it was on its way: don't lose that.
    if (changes !== at && link?.storyId === id) return set({ status: 'conflict' })
    apply(story.prepare(found.data))
    setLink({ userId: signedIn.id, storyId: id, version: found.row.version, dirty: false })
    set({ status: 'synced', savedAt: Date.now(), error: null })
  }

  function apply(data: StoryData) {
    loading = true
    try {
      story.load(data)
    } finally {
      loading = false
    }
  }

  /** Adds this browser's story to the account as a new story, and keeps them in step. */
  async function addThis() {
    const signedIn = user()!
    const data = story.read()
    const at = changes
    const row = await need().createStory(data.title, data)
    setLink({ userId: signedIn.id, storyId: row.id, version: row.version, dirty: changes !== at })
    set({ status: 'synced', savedAt: Date.now(), error: null, stories: [row, ...(state().stories ?? []).filter((s) => s.id !== row.id)] })
    if (changes !== at) scheduleSave()
    void uploadPictures(signedIn, data)
  }

  /** Before leaving this story for another: its last changes saved to the account. */
  async function saveFirst() {
    if (state().status === 'conflict') throw new CloudError('First choose which version of this story to keep.')
    if (!link?.dirty || BLOCKED.includes(state().status)) return
    await save()
    if (link?.dirty) throw new CloudError('This story’s latest changes aren’t saved to your account yet, so it’s still open. Try again in a moment.')
  }

  function trouble(error: unknown) {
    const offline = isOffline(error)
    set(offline ? { status: 'offline', error: null } : { status: 'error', error: error instanceof Error ? error.message : String(error) })
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => void resume(), offline ? retryDelay : retryDelay * 4)
  }

  /** Carries on after a pause (back online, back in view): checks for changes made elsewhere and saves this one's. */
  function resume() {
    return serial(async () => {
      const signedIn = user()
      const { status } = state()
      if (!signedIn || !['synced', 'offline', 'error'].includes(status)) return
      if (!link) return connect(signedIn)
      if (status !== 'synced') set({ status: 'synced' })
      await check()
    })
  }

  async function loadUploaded(signedIn: CloudUser) {
    try {
      uploaded = new Set(await need().listPictures(signedIn.id))
    } catch {
      uploaded = null
    }
  }

  /** The story's pictures, saved to the account (those not there yet). */
  async function uploadPictures(signedIn: CloudUser, data: StoryData) {
    if (uploading || !backend) return
    uploading = true
    try {
      if (!uploaded) await loadUploaded(signedIn)
      if (!uploaded) return
      for (const id of pictures.idsIn(data)) {
        if (uploaded.has(id)) continue
        const blob = await pictures.get(id)
        if (!blob) continue
        await backend.uploadPicture(signedIn.id, id, blob)
        uploaded.add(id)
      }
    } catch {
      // The next save tries again.
    } finally {
      uploading = false
    }
  }

  return {
    store,

    /** Starts keeping track of changes; connects at once if the writer may be signed in already. */
    start({ connect: now }: { connect: boolean }) {
      unsubscribe ??= story.subscribe(onLocalChange)
      if (now || link) void ensureBackend()
    },

    stop() {
      unsubscribe?.()
      unsubscribe = null
      clearTimeout(saveTimer)
      clearTimeout(retryTimer)
    },

    /** Loads the backend, so the sign-in form is ready. */
    prepare: () => ensureBackend().then(() => undefined),

    /** Once the backend has said whether the writer is signed in. */
    ready: () => ready,

    async signIn(email: string, password: string) {
      await (await ensureBackend()).signIn(email.trim(), password)
    },

    /** Creates an account: true if signed in, false if its email address must be confirmed first. */
    async signUp(email: string, password: string) {
      return !!(await (await ensureBackend()).signUp(email.trim(), password))
    },

    async sendPasswordReset(email: string) {
      await (await ensureBackend()).sendPasswordReset(email.trim())
    },

    async setPassword(password: string) {
      await (await ensureBackend()).setPassword(password)
      set({ recovering: false })
    },

    cancelRecovery: () => set({ recovering: false }),

    /** Signs out, after saving the story's last changes; the story stays in this browser. */
    async signOut() {
      await serial(saveFirst).catch(() => {})
      await need().signOut()
      clearTimeout(saveTimer)
      setLink(null)
      set({ user: null, status: 'signed-out', stories: null, savedAt: null, error: null })
    },

    refreshStories: () =>
      serial(async () => {
        set({ stories: await need().listStories() })
      }),

    /** Opens a story from the account here, in place of this browser's (backed up first, if it isn't in the account). */
    openStory: (id: string) =>
      serial(async () => {
        if (link?.storyId === id) return
        await saveFirst()
        if (!link) await story.backup()
        await pull(id)
      }),

    /** Adds this browser's story to the account, to keep in step with it. */
    addThisStory: () => serial(addThis),

    /** A new story (blank, the example, an imported one) in the account, opened here in place of the one open now. */
    newStory: (data: unknown) =>
      serial(async () => {
        await saveFirst()
        if (!link) await story.backup()
        const signedIn = user()!
        const ready = story.prepare(data)
        const row = await need().createStory(ready.title, ready)
        apply(ready)
        setLink({ userId: signedIn.id, storyId: row.id, version: row.version, dirty: false })
        set({ status: 'synced', savedAt: Date.now(), error: null, stories: [row, ...(state().stories ?? [])] })
        void uploadPictures(signedIn, ready)
      }),

    /** Deletes a story from the account (never the one open here). */
    deleteStory: (id: string) =>
      serial(async () => {
        if (link?.storyId === id) throw new CloudError('That story is open here. Open another one first.')
        await need().deleteStory(id)
        set({ stories: (state().stories ?? []).filter((s) => s.id !== id) })
      }),

    /** Both changed: this browser's version goes to the account (over the other). */
    keepThisVersion: () =>
      serial(async () => {
        const target = link
        if (!target) return
        const other = await need().getStory(target.storyId)
        if (!other) return addThis()
        // The other version, kept in this browser's backups.
        await story.backup(story.prepare(other.data))
        setLink({ ...target, version: other.row.version, dirty: true })
        set({ status: 'saving' })
        await save()
      }),

    /** Both changed: the account's version replaces this browser's (backed up first). */
    takeOtherVersion: () =>
      serial(async () => {
        if (!link) return
        await story.backup()
        await pull(link.storyId)
      }),

    resume,

    /** Saves now (rather than after the pause). */
    saveNow: () => serial(save),

    /** The account's links for AI assistants (see server/mcp.ts). */
    listAssistantLinks: () => need().listAssistantLinks(),

    /** A new link for an AI assistant: its key comes back this once; the account keeps only a fingerprint of it. */
    async createAssistantLink(label: string) {
      const key = newKey()
      const link = await need().addAssistantLink(label.trim().slice(0, 80), await keyHash(key), key.slice(-4))
      return { link, key }
    },

    revokeAssistantLink: (id: string) => need().revokeAssistantLink(id),

    /** A picture from the account, for one this browser doesn't have. */
    async fetchPicture(id: string): Promise<Blob | null> {
      const signedIn = user()
      if (!signedIn || !backend) return null
      try {
        return await backend.downloadPicture(signedIn.id, id)
      } catch {
        return null
      }
    },
  }
}

export type Cloud = ReturnType<typeof createCloud>
