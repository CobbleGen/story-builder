import type { StoryData } from '../types'
import { bookOf, emptyBook, nextDraftName } from '../lib/drafts'
import { makeId } from '../lib/id'

// Drafts: opening another, starting one (a copy of the open draft, or
// blank), renaming and deleting. The open draft's book is the story's own
// fields; opening another puts this one's away in its draft and takes that
// one's out.

/** Opens another draft. */
export function switchDraft(data: StoryData, id: string): StoryData {
  const target = data.drafts.find((d) => d.id === id)
  if (!target || id === data.draft || !target.book) return data
  return {
    ...data,
    ...target.book,
    drafts: data.drafts.map((d) => {
      if (d.id === data.draft) return { ...d, book: bookOf(data) }
      if (d.id === id) {
        const { book: _, ...open } = d
        return open
      }
      return d
    }),
    draft: id,
  }
}

/**
 * Starts a draft, after the open one, and opens it: a copy of the open
 * draft (the same chapters, arcs and beats, to change as you like) or blank.
 */
export function newDraft(data: StoryData, { copy, name, at = Date.now() }: { copy: boolean; name?: string; at?: number }): [StoryData, string] {
  const id = makeId('draft')
  const draft = { id, name: name?.trim() || nextDraftName(data.drafts), createdAt: at }
  const index = data.drafts.findIndex((d) => d.id === data.draft)
  const drafts = data.drafts.map((d) => (d.id === data.draft ? { ...d, book: bookOf(data) } : d))
  drafts.splice(index + 1, 0, draft)
  return [{ ...data, ...(copy ? {} : emptyBook()), drafts, draft: id }, id]
}

export function renameDraft(data: StoryData, id: string, name: string): StoryData {
  const clean = name.trim().slice(0, 120)
  if (!clean || !data.drafts.some((d) => d.id === id && d.name !== clean)) return data
  return { ...data, drafts: data.drafts.map((d) => (d.id === id ? { ...d, name: clean } : d)) }
}

/** Deletes a draft that isn't open, with what was archived from it. The last draft stays. */
export function deleteDraft(data: StoryData, id: string): StoryData {
  if (id === data.draft || !data.drafts.some((d) => d.id === id)) return data
  return {
    ...data,
    drafts: data.drafts.filter((d) => d.id !== id),
    archive: data.archive.some((a) => a.draft === id) ? data.archive.filter((a) => a.draft !== id) : data.archive,
  }
}

/** Moves a draft to another place in the list. */
export function moveDraft(data: StoryData, from: number, to: number): StoryData {
  if (from === to || from < 0 || from >= data.drafts.length) return data
  const drafts = data.drafts.slice()
  const [d] = drafts.splice(from, 1)
  drafts.splice(Math.max(0, Math.min(to, drafts.length)), 0, d)
  return { ...data, drafts }
}
