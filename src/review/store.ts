import { create } from 'zustand'
import { useStory } from '../store/storyStore'
import { setRemotePictures, retryMissingPictures } from '../store/images'
import { connectComments, refreshComments, type CommentsBackend } from '../comments/store'
import { reviewToken } from './mode'
import { LinkGone, type ReviewBackend } from './backend'

// An editor's review of a writer's story: opened from the review link, read
// here (and not kept), commented on. The editor's name goes with their
// comments; a secret kept in this browser lets them change and delete their
// own.

export type ReviewStatus = 'opening' | 'open' | 'gone' | 'error'

interface ReviewState {
  status: ReviewStatus
  error: string | null
  title: string
  /** Who the writer made the link for. */
  label: string
  /** When the writer last saved the story, as it was opened. */
  savedAt: string | null
  /** The editor's name, with their comments ('' until they say). */
  name: string
}

const NAME_KEY = 'story-builder:review-name'
const ME_KEY = 'story-builder:review-me'

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Without storage, it lasts until the page closes.
  }
}

export const useReview = create<ReviewState>(() => ({ status: 'opening', error: null, title: '', label: '', savedAt: null, name: read(NAME_KEY) }))

/** The secret this browser keeps, to know the editor's own comments (made once). */
let me = read(ME_KEY)
function myKey(): string {
  if (!me) {
    const bytes = crypto.getRandomValues(new Uint8Array(24))
    me = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    write(ME_KEY, me)
  }
  return me
}

export function setReviewerName(name: string) {
  const clean = name.trim().slice(0, 80)
  write(NAME_KEY, clean)
  useReview.setState({ name: clean })
}

declare global {
  interface Window {
    /** Browser tests (dev builds only) put a stand-in for the account service here. */
    __testReview?: (token: string) => ReviewBackend
  }
}

let backend: ReviewBackend | null = null

async function loadBackend(token: string): Promise<ReviewBackend> {
  const test = import.meta.env.DEV ? window.__testReview : undefined
  if (test) return test(token)
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined
  if (!url || !key) throw new Error('This copy of Story Builder isn’t connected to accounts, so it can’t open review links.')
  const { supabaseReview } = await import('./supabaseReview')
  return supabaseReview(url, key, token)
}

function trouble(error: unknown) {
  if (error instanceof LinkGone) useReview.setState({ status: 'gone', error: error.message })
  else useReview.setState({ status: 'error', error: error instanceof Error ? error.message : String(error) })
}

const nameNow = () => useReview.getState().name || 'Editor'

function editorComments(b: ReviewBackend): CommentsBackend {
  return {
    viewer: 'editor',
    list: () => b.listComments(myKey()),
    add: (thread, target, body) => b.addComment(myKey(), nameNow(), thread, target, body),
    resolve: (id, resolved) => b.resolveComment(nameNow(), id, resolved),
    edit: (id, body) => b.editComment(myKey(), id, body),
    remove: (id) => b.removeComment(myKey(), id),
  }
}

/** Opens the story the review link is to (again, to see the writer's latest). */
export async function openReview(): Promise<void> {
  if (!reviewToken) {
    useReview.setState({ status: 'gone', error: 'This review link isn’t whole: copy all of it from the message it came in.' })
    return
  }
  try {
    backend ??= await loadBackend(reviewToken)
    const b = backend
    const story = await b.open()
    useStory.getState().loadStory(story.data as never)
    setRemotePictures((id) => b.downloadPicture(story.owner, id))
    retryMissingPictures()
    useReview.setState({ status: 'open', error: null, title: story.title, label: story.label, savedAt: story.updatedAt })
    connectComments(editorComments(b), story.id)
    void refreshComments()
  } catch (error) {
    trouble(error)
  }
}

let started = false

/** Opens the review, and keeps its comments up to date while it's open. */
export function startReview() {
  if (started) return
  started = true
  void openReview()
  const again = () => {
    if (document.visibilityState === 'visible' && useReview.getState().status === 'open') void refreshComments()
  }
  window.addEventListener('focus', again)
  document.addEventListener('visibilitychange', again)
  setInterval(again, 60_000)
}
