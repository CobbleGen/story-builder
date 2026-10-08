// What the app needs from its backend: accounts, the stories in each
// account, and their pictures. Supabase provides it (supabaseBackend.ts);
// tests use an in-memory one.

export interface CloudUser {
  id: string
  email: string
}

/** A story in an account, without its contents. */
export interface CloudStoryRow {
  id: string
  title: string
  /** Goes up by one with every save, wherever it's saved from. */
  version: number
  /** When it was last saved (ISO date). */
  updatedAt: string
}

export type AuthEvent = 'signed-in' | 'signed-out' | 'password-recovery'

/** A link an AI assistant reads the account's stories through (see server/mcp.ts). */
export interface AssistantLink {
  id: string
  /** What the writer called it ("Claude"). */
  label: string
  /** The key's last few characters, to tell links apart (the key itself isn't kept). */
  hint: string
  /** ISO dates. */
  createdAt: string
  lastUsedAt: string | null
}

export interface CloudBackend {
  /** Calls back with the signed-in user straight away (null if none), then on every change. */
  onAuthChange(callback: (event: AuthEvent, user: CloudUser | null) => void): () => void
  signIn(email: string, password: string): Promise<CloudUser>
  /** Creates an account; null when the email address has to be confirmed first. */
  signUp(email: string, password: string): Promise<CloudUser | null>
  sendPasswordReset(email: string): Promise<void>
  setPassword(password: string): Promise<void>
  signOut(): Promise<void>

  listStories(): Promise<CloudStoryRow[]>
  /** A story and its contents; null if there's no such story (any more). */
  getStory(id: string): Promise<{ row: CloudStoryRow; data: unknown } | null>
  /** A story's current version; null if it's gone. */
  getVersion(id: string): Promise<number | null>
  createStory(title: string, data: unknown): Promise<CloudStoryRow>
  /** Saves over version `version`; null if it's been saved elsewhere since (or is gone). */
  saveStory(id: string, title: string, data: unknown, version: number): Promise<CloudStoryRow | null>
  deleteStory(id: string): Promise<void>

  /** The account's links for AI assistants, newest first. */
  listAssistantLinks(): Promise<AssistantLink[]>
  /** Keeps a new link: only its key's fingerprint (SHA-256, hex) and last characters. */
  addAssistantLink(label: string, keyHash: string, hint: string): Promise<AssistantLink>
  revokeAssistantLink(id: string): Promise<void>

  /** The ids of the pictures stored for a user. */
  listPictures(userId: string): Promise<string[]>
  uploadPicture(userId: string, id: string, blob: Blob): Promise<void>
  downloadPicture(userId: string, id: string): Promise<Blob | null>
}

/** A failure to show the writer, in words they can act on. `offline`: the backend couldn't be reached. */
export class CloudError extends Error {
  readonly offline: boolean
  constructor(message: string, offline = false) {
    super(message)
    this.name = 'CloudError'
    this.offline = offline
  }
}

export const isOffline = (error: unknown) =>
  (error instanceof CloudError && error.offline) ||
  (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) ||
  (typeof navigator !== 'undefined' && navigator.onLine === false)
