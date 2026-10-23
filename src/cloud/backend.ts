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

/** A link that lets an editor read one story and comment on it (see src/review). */
export interface ReviewLink {
  id: string
  storyId: string
  /** Who it's for ("Anna"). */
  label: string
  /** The link's secret part (…/?review=<token>), kept so it can be copied again. */
  token: string
  /** ISO dates. */
  createdAt: string
  lastUsedAt: string | null
}

/** A comment as the account sends it: one row (see comments/model's commentOf). */
export type CommentRow = Record<string, unknown>

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

  /** A story's comments, oldest first (see src/comments). */
  listComments(storyId: string): Promise<CommentRow[]>
  /** Adds a comment (a reply, with `thread`; else a thread's first, on `target`); its id. `name`: the writer's, as editors see it. */
  addComment(storyId: string, thread: string | null, target: unknown, body: string, name: string): Promise<string>
  /** Resolves a thread, or opens it again. */
  resolveComment(storyId: string, id: string, resolved: boolean, name: string): Promise<void>
  editComment(storyId: string, id: string, body: string): Promise<void>
  /** Deletes a comment (any in the writer's story). */
  removeComment(storyId: string, id: string): Promise<void>

  /** A story's review links, newest first. */
  listReviewLinks(storyId: string): Promise<ReviewLink[]>
  addReviewLink(storyId: string, label: string, token: string): Promise<ReviewLink>
  revokeReviewLink(id: string): Promise<void>

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
