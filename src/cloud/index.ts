import { useStore } from 'zustand'
import type { StoryData } from '../types'
import { STORY_KEYS, pickData, useStory } from '../store/storyStore'
import { upgradeStory } from '../store/archive'
import { backupNow, flushStory } from '../store/persistence'
import { saveBackup } from '../store/backups'
import { getImage, imageIdsIn, retryMissingPictures, setRemotePictures } from '../store/images'
import { createCloud, type Cloud, type CloudState, type Link } from './engine'
import { CloudError, type CloudBackend } from './backend'
import { connectComments, refreshComments, type CommentsBackend } from '../comments/store'
import { reviewing } from '../review/mode'

// The writer's account, wired to the story in this browser. Set up when the
// build has a backend (VITE_SUPABASE_URL and VITE_SUPABASE_KEY, see .env);
// without one the app works as before, in this browser only.

export type { CloudStatus, CloudState } from './engine'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined
const LINK_KEY = 'story-builder:account-link'
/** The story's save format version (as in storyStore's persist options), for backups. */
const SAVE_VERSION = 3

function readLink(): Link | null {
  try {
    const link = JSON.parse(localStorage.getItem(LINK_KEY) ?? 'null')
    return link && typeof link.storyId === 'string' && typeof link.userId === 'string' ? link : null
  } catch {
    return null
  }
}

function writeLink(link: Link | null) {
  try {
    if (link) localStorage.setItem(LINK_KEY, JSON.stringify(link))
    else localStorage.removeItem(LINK_KEY)
  } catch {
    // Without storage the link lasts until the page closes.
  }
}

declare global {
  interface Window {
    /** Browser tests (dev builds only) put a stand-in for the account service here. */
    __testCloud?: () => CloudBackend
  }
}
const testBackend = import.meta.env.DEV && typeof window !== 'undefined' ? window.__testCloud : undefined

// (Reviewing someone's story, this browser's account isn't used: see src/review.)
export const cloud: Cloud | null =
  !reviewing && ((URL_ && KEY) || testBackend)
    ? createCloud({
        backend: () => (testBackend ? Promise.resolve(testBackend()) : import('./supabaseBackend').then((m) => m.supabaseBackend(URL_!, KEY!))),
        story: {
          read: () => pickData(useStory.getState()),
          prepare: (data) => upgradeStory(data),
          load: (data: StoryData) => {
            useStory.getState().loadStory(data)
            retryMissingPictures()
          },
          subscribe: (onChange) =>
            useStory.subscribe((now, before) => {
              if (STORY_KEYS.some((k) => now[k] !== before[k])) onChange()
            }),
          backup: async (data) => {
            if (data) return saveBackup(JSON.stringify({ state: data, version: SAVE_VERSION }), 'before-replace')
            await flushStory()
            await backupNow()
          },
        },
        pictures: {
          idsIn: (data) => imageIdsIn(JSON.stringify(data)),
          get: async (id) => (await getImage(id))?.blob,
        },
        links: { read: readLink, write: writeLink },
      })
    : null

const OFF: CloudState = {
  status: 'off',
  user: null,
  storyId: null,
  pending: false,
  stories: null,
  savedAt: null,
  error: null,
  notice: null,
  recovering: false,
}
const offStore = { getState: () => OFF, getInitialState: () => OFF, setState: () => {}, subscribe: () => () => {} }

/** The account's state, for showing it. */
export function useCloud<T>(select: (state: CloudState) => T): T {
  return useStore(cloud?.store ?? (offStore as unknown as NonNullable<typeof cloud>['store']), select)
}

/** Whether the browser holds a sign-in from before (Supabase keeps it under sb-<project>-auth-token). */
function signedInBefore(): boolean {
  if (testBackend) return true
  try {
    return Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
  } catch {
    return false
  }
}

const NAME_KEY = 'story-builder:writer-name'

/** The writer's name with their comments, as editors see it ('' for "the writer"). */
export function writerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setWriterName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 80))
  } catch {
    // Without storage, the name lasts until the page closes… or not at all.
  }
}

/** The writer's comments on the story open here, through their account. */
function writerComments(c: Cloud): CommentsBackend {
  const account = () => {
    const a = c.account()
    if (!a) throw new CloudError('Can’t reach your account just now, so comments can’t be changed. Try again in a moment.')
    return a
  }
  return {
    viewer: 'writer',
    list: async () => {
      const { backend, storyId } = account()
      return backend.listComments(storyId)
    },
    add: async (thread, target, body) => {
      const { backend, storyId } = account()
      return backend.addComment(storyId, thread, target, body, writerName())
    },
    resolve: async (id, resolved) => {
      const { backend, storyId } = account()
      return backend.resolveComment(storyId, id, resolved, writerName())
    },
    edit: async (id, body) => {
      const { backend, storyId } = account()
      return backend.editComment(storyId, id, body)
    },
    remove: async (id) => {
      const { backend, storyId } = account()
      return backend.removeComment(storyId, id)
    },
  }
}

/** Comments on whichever account story is open here (none while signed out, or the story isn't in the account). */
function followComments(c: Cloud) {
  const backend = writerComments(c)
  const update = () => {
    const { user, storyId, status } = c.store.getState()
    const on = !!user && !!storyId && !['off', 'signed-out', 'unlinked', 'connecting'].includes(status)
    connectComments(on ? backend : null, on ? storyId : null)
  }
  update()
  c.store.subscribe((now, before) => {
    if (now.user !== before.user || now.storyId !== before.storyId || now.status !== before.status) update()
    // Connected (again): what's been said meanwhile.
    if (now.status === 'synced' && before.status !== 'synced' && before.status !== 'saving') void refreshComments()
  })
}

let started = false

/** Connects to the account (if signed in) and keeps the story in step from then on. */
export function startCloud() {
  if (!cloud || started) return
  started = true
  const params = new URLSearchParams(location.search)
  // Back from a link in an account email: Supabase reads ?code= and signs in.
  const fromEmail = params.has('code') || params.has('error_description')
  if (params.has('error_description')) {
    cloud.store.setState({ error: linkTrouble(params.get('error_description') ?? '') })
  }
  cloud.start({ connect: signedInBefore() || fromEmail })
  setRemotePictures((id) => cloud!.fetchPicture(id))
  followComments(cloud)
  // Pictures this browser was missing may be in the account: look again once connected.
  cloud.store.subscribe((now, before) => {
    if (now.user && now.status !== 'connecting' && before.status === 'connecting') retryMissingPictures()
  })
  if (fromEmail) {
    void cloud.ready().then(() => {
      // A link opened in another browser than the one it was asked for in can't sign in there.
      if (params.has('code') && !cloud!.store.getState().user) {
        cloud!.store.setState({
          notice: 'If that link was to confirm your email address, it’s confirmed: sign in to carry on. (A link to reset your password only works in the browser you asked for it in.)',
        })
      }
      // Read: the link's code comes off the address (the app's routes are in its #).
      history.replaceState(history.state, '', `${location.pathname}${location.hash}`)
    })
  }

  // Picks up changes made elsewhere when the app comes back into view or online, and every so often.
  const resume = () => {
    if (document.visibilityState !== 'visible') return
    void cloud!.resume()
    void refreshComments()
  }
  window.addEventListener('focus', resume)
  window.addEventListener('online', resume)
  document.addEventListener('visibilitychange', resume)
  setInterval(resume, 60_000)
  // Leaving: save what's waiting (the browser may not finish it).
  window.addEventListener('pagehide', () => void cloud!.saveNow())
}

function linkTrouble(description: string): string {
  if (/expired|invalid/i.test(description)) return 'That email link has expired or was already used. Sign in, or ask for a new one.'
  return description || 'That email link didn’t work.'
}
