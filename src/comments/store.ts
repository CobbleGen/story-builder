import { create } from 'zustand'
import { useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { lookupOf } from '../lib/mentions'
import { commentOf, countComments, labelFor, threadsOf, type CommentCounts, type CommentTarget, type CommentThread, type StoryComment, type TargetKind } from './model'

// The comments on the story open here, as last heard from the account, and
// what's done with them: comment, reply, resolve, change, delete. Who's
// commenting decides where they go (see `CommentsBackend`): the writer's own
// account, or a review link.

export interface CommentsBackend {
  /** Who's looking: the writer, or an editor with a review link. */
  viewer: 'writer' | 'editor'
  list(): Promise<Record<string, unknown>[]>
  /** A reply (with `thread`) or a thread's first comment (on `target`); its id. */
  add(thread: string | null, target: CommentTarget | null, body: string): Promise<string>
  resolve(id: string, resolved: boolean): Promise<void>
  edit(id: string, body: string): Promise<void>
  remove(id: string): Promise<void>
}

interface CommentsState {
  backend: CommentsBackend | null
  /** Which story's comments these are. */
  key: string | null
  comments: StoryComment[]
  threads: CommentThread[]
  /** Heard from the account at least once (for this story). */
  loaded: boolean
  error: string | null
}

export const useComments = create<CommentsState>(() => ({ backend: null, key: null, comments: [], threads: [], loaded: false, error: null }))

const CACHE = 'story-builder:comments:'

function cached(key: string): StoryComment[] {
  try {
    const rows = JSON.parse(localStorage.getItem(CACHE + key) ?? '[]')
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function keep(key: string, comments: StoryComment[]) {
  try {
    localStorage.setItem(CACHE + key, JSON.stringify(comments))
  } catch {
    // Without storage, they're fetched again next time.
  }
}

function set(comments: StoryComment[]) {
  useComments.setState({ comments, threads: threadsOf(comments), loaded: true, error: null })
}

/**
 * Comments now come from `backend`, for the story known as `key` (or none:
 * comments are off). The writer's are kept in this browser too, to show
 * straight away next time.
 */
export function connectComments(backend: CommentsBackend | null, key: string | null) {
  const now = useComments.getState()
  if (now.backend === backend && now.key === key) return
  const keepHere = backend?.viewer === 'writer' && key
  const comments = keepHere ? cached(key) : []
  useComments.setState({ backend, key, comments, threads: threadsOf(comments), loaded: false, error: null })
  if (backend) void refreshComments()
}

let refreshing: Promise<void> | null = null

/** Fetches the comments again (once at a time). */
export function refreshComments(): Promise<void> {
  const { backend, key } = useComments.getState()
  if (!backend) return Promise.resolve()
  // (Never throwing here: whatever goes wrong with comments, the story and its saving carry on.)
  refreshing ??= Promise.resolve()
    .then(() => backend.list())
    .then((rows) => {
      if (useComments.getState().backend !== backend) return
      const comments = rows.map(commentOf).filter((c): c is StoryComment => !!c)
      set(comments)
      if (backend.viewer === 'writer' && key) keep(key, comments)
    })
    .catch((error) => {
      if (useComments.getState().backend === backend) useComments.setState({ error: error instanceof Error ? error.message : String(error) })
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

function need(): CommentsBackend {
  const { backend } = useComments.getState()
  if (!backend) throw new Error('Comments are kept in your account: sign in, with this story in your account, to comment.')
  return backend
}

/** Does something with the comments, then fetches them again, so they show what everyone has added meanwhile. */
async function act<T>(run: (backend: CommentsBackend) => Promise<T>): Promise<T> {
  const value = await run(need())
  await refreshComments()
  return value
}

/** Starts a thread on `target`; its id. */
export const addComment = (target: CommentTarget, body: string) => act((b) => b.add(null, target, body.trim()))
export const replyTo = (thread: string, body: string) => act((b) => b.add(thread, null, body.trim()))
export const resolveThread = (thread: string, resolved: boolean) => act((b) => b.resolve(thread, resolved))
export const editComment = (id: string, body: string) => act((b) => b.edit(id, body.trim()))
export const removeComment = (id: string) => act((b) => b.remove(id))

/** Whether comments can be read and made here: signed in with the story in the account, or reviewing. */
export const useCommentsOn = () => useComments((s) => !!s.backend)

/** Who's looking. */
export const useViewer = () => useComments((s) => s.backend?.viewer ?? 'writer')

const counted = new WeakMap<CommentThread[], Map<string, CommentCounts>>()

/** The open comments in a draft, counted (once for every badge that shows them). */
function countsOf(threads: CommentThread[], draft: string): CommentCounts {
  let byDraft = counted.get(threads)
  if (!byDraft) counted.set(threads, (byDraft = new Map()))
  let counts = byDraft.get(draft)
  if (!counts) byDraft.set(draft, (counts = countComments(threads, draft)))
  return counts
}

/** The open comments, counted for the badges, in the open draft. */
export function useCommentCounts(): CommentCounts {
  const threads = useComments((s) => s.threads)
  const draft = useStory((s) => s.draft)
  return countsOf(threads, draft)
}

// ---------- The comments panel ----------

/** Which comments the panel shows: those on one thing, or all. */
export interface CommentFilter {
  kind: TargetKind
  id?: string
  node?: string
}

interface PanelState {
  open: boolean
  /** Only those on one thing (a chapter, a beat…), or all of them. */
  filter: CommentFilter | null
  /** The thread to show first and point out. */
  focus: string | null
  /** A new comment being written, on this. */
  compose: CommentTarget | null
  resolved: boolean
}

export const useCommentPanel = create<PanelState>(() => ({ open: false, filter: null, focus: null, compose: null, resolved: false }))

/** Opens the comments: on one thing, at one thread, or to write a new one. */
export function openComments(options: { filter?: CommentFilter | null; focus?: string | null; compose?: CommentTarget | null } = {}) {
  // (The beat being edited makes way: its comments are in the panel, and it opens again from there.)
  if (useUi.getState().editingBeatId) useUi.getState().openBeat(null)
  useCommentPanel.setState({
    open: true,
    filter: options.filter ?? null,
    focus: options.focus ?? null,
    compose: options.compose ?? null,
    ...(options.focus ? { resolved: !!useComments.getState().threads.find((t) => t.id === options.focus)?.resolved } : {}),
  })
}

export const closeComments = () => useCommentPanel.setState({ open: false, compose: null, focus: null })

/** Opens the panel with a new comment on `target`, named as it is now (for when it's gone). */
export function startComment(target: CommentTarget) {
  const data = useStory.getState()
  const lookup = lookupOf([...data.characters, ...data.elements])
  const draft = 'id' in target && ['chapter', 'text', 'beat', 'arc'].includes(target.kind) ? { draft: data.draft } : {}
  const named = { ...target, ...draft } as CommentTarget
  openComments({ filter: filterFor(named), compose: { ...named, label: labelFor(named, data, lookup) } })
}

export const filterFor = (t: CommentTarget): CommentFilter =>
  t.kind === 'story' ? { kind: 'story' } : t.kind === 'map' ? { kind: 'map', id: t.id, node: t.node } : { kind: t.kind === 'text' ? 'chapter' : t.kind, id: t.id }
