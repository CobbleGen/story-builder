import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { create } from 'zustand'
import type { StoryData } from '../types'
import { displayName, plainText, type Lookup } from './mentions'

// Where you've been in this tab, so a page can take you back to where you
// were: each entry of the browser's history the app has seen, in order (by
// the key the router gives it), and which one you're at. It's kept for the
// tab (sessionStorage), so it lasts through a reload.

export interface TrailEntry {
  key: string
  /** The page: its path (and query). */
  path: string
}

export interface Trail {
  entries: TrailEntry[]
  at: number
}

export type NavigationKind = 'PUSH' | 'REPLACE' | 'POP'

const STORAGE_KEY = 'story-builder:trail'
const LONGEST = 200
const EMPTY: Trail = { entries: [], at: -1 }

/** The trail after moving to `entry`: a new page (PUSH), the same place changed (REPLACE), or back or forward (POP). */
export function step(trail: Trail, entry: TrailEntry, kind: NavigationKind): Trail {
  const known = trail.entries.findIndex((e) => e.key === entry.key)
  // Where it is already (told twice), or back or forward to a page it has seen.
  if (known >= 0 && (known === trail.at || kind === 'POP')) {
    const entries = trail.entries.slice()
    entries[known] = entry
    return { entries, at: known }
  }
  if (kind === 'REPLACE' && trail.at >= 0 && trail.at < trail.entries.length) {
    const entries = trail.entries.slice()
    entries[trail.at] = entry
    return { entries, at: trail.at }
  }
  // An entry the app hasn't seen go back or forward to (the first page opened, say) starts afresh.
  if (kind !== 'PUSH') return { entries: [entry], at: 0 }
  const entries = [...trail.entries.slice(0, trail.at + 1), entry].slice(-LONGEST)
  return { entries, at: entries.length - 1 }
}

function load(): Trail {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(saved?.entries) && typeof saved.at === 'number') return saved as Trail
  } catch {
    // Storage unavailable or unreadable: start afresh.
  }
  return EMPTY
}

const useTrail = create<Trail>(load)

/** Follows the router along, for the back links. Call once, inside the router. */
export function useKeepTrail() {
  const location = useLocation()
  const kind = useNavigationType()
  // Before the page is painted, so its back link never shows the wrong place.
  useLayoutEffect(() => {
    const next = step(useTrail.getState(), { key: location.key, path: location.pathname + location.search }, kind)
    useTrail.setState(next, true)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Not kept past a reload, then.
    }
  }, [location.key, location.pathname, location.search, kind])
}

/**
 * The page before this one, to go back to: its path, and `back` to go there
 * the way the browser's Back button would (or to the chapter board, when you
 * started on this page). `then` happens once this page has gone, for what it
 * shouldn't be seen without (the arc it's the page of, deleted).
 */
export function useBack(): { path: string | null; back: (then?: () => void) => void } {
  const { key } = useLocation()
  const navigate = useNavigate()
  const path = useTrail((t) => (t.entries[t.at]?.key === key ? (t.entries[t.at - 1]?.path ?? null) : null))
  const afterwards = useRef<(() => void) | null>(null)
  useEffect(() => () => afterwards.current?.(), [])
  return {
    path,
    back: (then) => {
      afterwards.current = then ?? null
      if (path) navigate(-1)
      else navigate('/', { replace: true })
    },
  }
}

const scrolls = new Map<string, { left: number; top: number }>()

/**
 * Keeps where an element is scrolled to for each visit to its page, and
 * scrolls it back there on coming back to that visit: a ref for the element.
 */
export function useScrollMemory(name: string) {
  const { key } = useLocation()
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el) return
      const id = `${key} ${name}`
      const was = scrolls.get(id)
      if (was) {
        el.scrollLeft = was.left
        el.scrollTop = was.top
      }
      const keep = () => scrolls.set(id, { left: el.scrollLeft, top: el.scrollTop })
      el.addEventListener('scroll', keep, { passive: true })
      return () => el.removeEventListener('scroll', keep)
    },
    [key, name],
  )
}

/** What a page is called in a back link: the view's name, or the arc's, character's or item's. */
export function placeName(path: string, story: Pick<StoryData, 'arcs' | 'characters' | 'elements'>, lookup: Lookup): string {
  const [, page, id] = path.split(/[/?]/)
  if (!page) return 'Chapter board'
  if (page === 'write') return 'Manuscript'
  if (page === 'map') return 'Mind map'
  if (page === 'timeline') return 'Timeline'
  if (page === 'arcs') {
    const arc = story.arcs.find((a) => a.id === id)
    if (arc) return plainText(arc.name, lookup).trim() || 'Untitled arc'
  }
  const item = page === 'characters' ? story.characters.find((c) => c.id === id) : page === 'elements' ? story.elements.find((e) => e.id === id) : undefined
  return item ? displayName(item) : 'Back'
}
