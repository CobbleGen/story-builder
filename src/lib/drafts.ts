import type { Draft, DraftBook, StoryData } from '../types'

// A story's drafts: each a book of its own (chapters and their text, arcs,
// beats, story time). The open draft's book is the story's own fields, so
// everything else works on it as it is; the others keep theirs apart.

export const DEFAULT_DRAFT_ID = 'draft_main'
export const firstDraft = (): Draft => ({ id: DEFAULT_DRAFT_ID, name: 'First draft', createdAt: 0 })

/** The open draft's book, from the story's own fields. */
export const bookOf = (data: Pick<StoryData, 'chapters' | 'arcs' | 'beats' | 'texts' | 'timeline'>): DraftBook => ({
  chapters: data.chapters,
  arcs: data.arcs,
  beats: data.beats,
  texts: data.texts,
  timeline: data.timeline,
})

export const emptyBook = (): DraftBook => ({ chapters: [], arcs: [], beats: {}, texts: {}, timeline: [] })

/** The open draft. */
export const openDraft = (data: Pick<StoryData, 'drafts' | 'draft'>): Draft => data.drafts.find((d) => d.id === data.draft) ?? data.drafts[0]

const elsewhere = new WeakMap<Draft[], Set<string>>()

/** The chapters, arcs and beats in drafts other than the open one, by id. */
export function idsElsewhere(data: Pick<StoryData, 'drafts' | 'draft'>): Set<string> {
  let ids = elsewhere.get(data.drafts)
  if (!ids) {
    ids = new Set()
    for (const d of data.drafts) {
      if (!d.book || d.id === data.draft) continue
      for (const c of d.book.chapters) ids.add(c.id)
      for (const a of d.book.arcs) ids.add(a.id)
      for (const b of Object.keys(d.book.beats)) ids.add(b)
    }
    elsewhere.set(data.drafts, ids)
  }
  return ids
}

/** A draft other than the open one with this chapter, arc or beat in it. */
export function draftHaving(data: Pick<StoryData, 'drafts' | 'draft'>, id: string): Draft | undefined {
  return data.drafts.find(
    (d) => d.id !== data.draft && !!d.book && (!!d.book.beats[id] || d.book.chapters.some((c) => c.id === id) || d.book.arcs.some((a) => a.id === id)),
  )
}

/** Words in a book's chapters. */
export const bookWords = (book: Pick<DraftBook, 'chapters' | 'texts'>) => book.chapters.reduce((n, c) => n + (book.texts[c.id]?.words ?? 0), 0)

/** A draft's book: its own, or the story's for the open one. */
export const draftBook = (data: StoryData, draft: Draft): DraftBook => (draft.id === data.draft || !draft.book ? bookOf(data) : draft.book)

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth']

/** A name for a new draft: "Second draft", "Third draft"… (one not taken). */
export function nextDraftName(drafts: Pick<Draft, 'name'>[]): string {
  const taken = new Set(drafts.map((d) => d.name.trim().toLowerCase()))
  for (let n = drafts.length + 1; ; n++) {
    const name = n <= ORDINALS.length ? `${ORDINALS[n - 1]} draft` : `Draft ${n}`
    if (!taken.has(name.toLowerCase())) return name
  }
}
