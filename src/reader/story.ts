import type { Arc, Beat, Chapter, Character, StoryData, StoryElement } from '../types'
import { displayName, lookupOf, plainText, type Lookup } from '../lib/mentions'
import { ELEMENT_KIND_NAMES } from '../lib/elements'
import { STATUS_LABELS } from '../lib/chapterStatus'
import { readingOrder } from '../store/storyOps'

// A story ready to be described in words, for an AI assistant reading it (see
// server/mcp.ts): everything by its name, and found again by what a writer
// would call it ("chapter 3", "The Logbook", "Mara").

export interface Story {
  data: StoryData
  lookup: Lookup
  /** Stored text as it reads: mentions by name, trimmed. */
  plain: (stored: string) => string
  /** 1 for the first chapter. */
  numberOf: (chapterId: string) => number
  chapter: (id: string | null | undefined) => Chapter | undefined
  /** "Chapter 3: The Logbook", or "Chapter 4" without a title. */
  chapterName: (chapter: Chapter) => string
  arc: (id: string) => Arc | undefined
  arcName: (arc: Arc | undefined) => string
  beatName: (beat: Beat) => string
  /** A character's or element's name, from its id ("unknown" if it's gone). */
  nameOf: (id: string) => string
  /** Beats in reading order: chapter by chapter, then those in no chapter, arc by arc. */
  readingBeats: Beat[]
}

export function storyOf(data: StoryData): Story {
  const lookup = lookupOf([...data.characters, ...data.elements])
  const plain = (stored: string) => plainText(stored ?? '', lookup).trim()
  const chapterIndex = new Map(data.chapters.map((c, i) => [c.id, i]))
  const arcs = new Map(data.arcs.map((a) => [a.id, a]))
  const numberOf = (id: string) => (chapterIndex.get(id) ?? -1) + 1
  return {
    data,
    lookup,
    plain,
    numberOf,
    chapter: (id) => (id ? data.chapters[chapterIndex.get(id) ?? -1] : undefined),
    chapterName: (c) => {
      const title = plain(c.title)
      return `Chapter ${numberOf(c.id)}${title ? `: ${title}` : ''}`
    },
    arc: (id) => arcs.get(id),
    arcName: (arc) => (arc ? plain(arc.name) || 'Untitled arc' : 'an arc that was deleted'),
    beatName: (b) => plain(b.title) || 'Untitled beat',
    nameOf: (id) => {
      const named = lookup.get(id)
      return named ? displayName(named) : 'unknown'
    },
    readingBeats: readingOrder(data).map((id) => data.beats[id]),
  }
}

/** "1 beat", "3 beats". */
export const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`

export const statusLabel = (c: Chapter) => STATUS_LABELS[c.status] ?? c.status

export const kindNoun = (e: StoryElement) => ELEMENT_KIND_NAMES[e.kind]?.noun ?? 'item'

export const isCharacter = (item: Character | StoryElement): item is Character => !('kind' in item)

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/**
 * Finds one of `items` by what someone would call it: its id, its name, or
 * failing that the one name that starts with it, or the one that contains it.
 */
export function findByName<T>(items: T[], ref: string, nameOf: (item: T) => string, idOf: (item: T) => string): T | undefined {
  const want = fold(ref)
  if (!want) return undefined
  const byId = items.find((item) => idOf(item) === ref.trim())
  if (byId) return byId
  const named = items.map((item) => ({ item, name: fold(nameOf(item)) }))
  for (const test of [(n: string) => n === want, (n: string) => n.startsWith(want), (n: string) => n.includes(want)]) {
    const found = named.filter((n) => test(n.name))
    if (found.length) return found[0].item
  }
  return undefined
}

/** A chapter by its number ("3", "chapter 3"), its title, or its id. */
export function findChapter(story: Story, ref: string | number): Chapter | undefined {
  const text = String(ref).trim()
  const number = /^(?:ch(?:apter)?\.?\s*)?(\d+)$/i.exec(text)
  if (number) return story.data.chapters[Number(number[1]) - 1]
  // "Chapter 3: The Logbook", as these descriptions name chapters.
  const named = /^chapter\s+(\d+)\s*:/i.exec(text)
  if (named) return story.data.chapters[Number(named[1]) - 1]
  return findByName(story.data.chapters, text, (c) => story.plain(c.title), (c) => c.id)
}

/** Something asked for that isn't in the story; the message says what there is instead. */
export class NotFound extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFound'
  }
}

/** "1. The Storm, 2. Wreckage…": what to ask for instead, when a chapter isn't found. */
export const chapterList = (story: Story) =>
  story.data.chapters.length
    ? story.data.chapters.map((c) => `${story.numberOf(c.id)}. ${story.plain(c.title) || '(untitled)'}`).join(', ')
    : 'there are no chapters yet'
