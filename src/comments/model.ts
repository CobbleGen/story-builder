import type { MapNode, StoryData } from '../types'
import { DEFAULT_DRAFT_ID } from '../lib/drafts'
import { plainText, type Lookup } from '../lib/mentions'
import { ELEMENT_KIND_NAMES } from '../lib/elements'
import { quoteLine, type TextAnchor } from './anchor'

// Comments on a story: what each is on (a passage of the manuscript, a
// chapter, a beat, an arc, a character, a place or thing, a mind map or a
// card on one, or the story as a whole), in threads, open or resolved. They
// are kept in the writer's account, apart from the story (see
// supabase/migrations): the writer, editors with a review link and AI
// assistants all add to them.

export type CommentAuthorKind = 'writer' | 'editor' | 'assistant'

/** What a comment is on. A chapter's, arc's or beat's (and a passage's) belongs to the draft it was made in. */
export type CommentTarget = (
  | { kind: 'story' }
  | { kind: 'chapter'; id: string; draft?: string }
  | ({ kind: 'text'; id: string; draft?: string } & TextAnchor)
  | { kind: 'beat'; id: string; draft?: string }
  | { kind: 'arc'; id: string; draft?: string }
  | { kind: 'character'; id: string }
  | { kind: 'element'; id: string }
  | { kind: 'map'; id: string; node?: string }
) & {
  /** What it was called when the comment was made, for when it's gone. */
  label?: string
}

export type TargetKind = CommentTarget['kind']

export interface StoryComment {
  id: string
  /** The thread it replies to; null for a thread's first comment. */
  thread: string | null
  author: { kind: CommentAuthorKind; name: string }
  /** Written by whoever's looking (from this browser, for an editor). */
  mine: boolean
  /** On a thread's first comment. */
  target: CommentTarget | null
  body: string
  /** ISO dates. */
  createdAt: string
  editedAt: string | null
  resolvedAt: string | null
  resolvedBy: string | null
}

export interface CommentThread {
  id: string
  first: StoryComment
  replies: StoryComment[]
  target: CommentTarget
  resolved: boolean
}

const BOOK_KINDS = new Set<TargetKind>(['chapter', 'text', 'beat', 'arc'])
const KINDS = new Set<TargetKind>(['story', 'chapter', 'text', 'beat', 'arc', 'character', 'element', 'map'])

const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : undefined)

/** A comment's target as saved, made right (null if it can't be). */
export function targetOf(value: unknown): CommentTarget | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const kind = v.kind as TargetKind
  if (!KINDS.has(kind)) return null
  const label = str(v.label, 300)
  const extra = label ? { label } : {}
  if (kind === 'story') return { kind, ...extra }
  const id = str(v.id, 200)
  if (!id) return null
  if (kind === 'map') {
    const node = str(v.node, 200)
    return { kind, id, ...(node ? { node } : {}), ...extra }
  }
  if (kind === 'character' || kind === 'element') return { kind, id, ...extra }
  const draft = str(v.draft, 200)
  const inDraft = draft ? { draft } : {}
  if (kind === 'text') {
    const quote = str(v.quote, 2000)
    if (!quote) return null
    return { kind, id, ...inDraft, quote, prefix: str(v.prefix, 200) ?? '', suffix: str(v.suffix, 200) ?? '', ...extra }
  }
  return { kind, id, ...inDraft, ...extra }
}

const AUTHORS = new Set<CommentAuthorKind>(['writer', 'editor', 'assistant'])

/** A comment as the account sends it (a row of writer_comments, review_comments…). */
export function commentOf(row: Record<string, unknown>): StoryComment | null {
  const id = str(row.id, 100)
  const body = str(row.body, 10000)
  const kind = row.author_kind as CommentAuthorKind
  if (!id || body === undefined || !AUTHORS.has(kind)) return null
  const thread = str(row.thread, 100) ?? null
  const target = thread ? null : targetOf(row.target)
  if (!thread && !target) return null
  return {
    id,
    thread,
    author: { kind, name: str(row.author_name, 80) ?? '' },
    mine: row.mine === true,
    target,
    body,
    createdAt: str(row.created_at, 40) ?? '',
    editedAt: str(row.edited_at, 40) ?? null,
    resolvedAt: str(row.resolved_at, 40) ?? null,
    resolvedBy: str(row.resolved_by, 80) ?? null,
  }
}

/** Comments in threads: each first comment with its replies, oldest first. */
export function threadsOf(comments: StoryComment[]): CommentThread[] {
  const threads = new Map<string, CommentThread>()
  for (const c of comments) {
    if (!c.thread && c.target) threads.set(c.id, { id: c.id, first: c, replies: [], target: c.target, resolved: !!c.resolvedAt })
  }
  for (const c of comments) {
    if (c.thread) threads.get(c.thread)?.replies.push(c)
  }
  const at = (t: CommentThread) => t.first.createdAt
  return [...threads.values()].sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0))
}

/** The draft a comment on a chapter, arc, beat or passage belongs to (none for the rest: they're every draft's). */
export const draftOf = (t: CommentTarget): string | null => (BOOK_KINDS.has(t.kind) ? ((t as { draft?: string }).draft ?? DEFAULT_DRAFT_ID) : null)

/** Whether a thread is about the open draft (or something every draft shares). */
export const inDraft = (t: CommentTarget, draft: string) => {
  const own = draftOf(t)
  return own === null || own === draft
}

/** Where in the app a comment is seen. */
export type CommentPlace = 'board' | 'manuscript' | 'timeline' | 'map' | 'arcs' | 'characters' | 'elements' | 'story'

/** Open comments, counted for the badges: in all, by page, and by what they're on. */
export interface CommentCounts {
  total: number
  /** By page: the chapter board (chapters and beats), the manuscript (chapters and passages), story time (beats), the mind maps, the sidebar's tabs. */
  places: Record<CommentPlace, number>
  /** Chapters' (and their passages'), by chapter id. */
  chapters: Map<string, number>
  /** Beats', arcs', characters' and elements', by id. */
  things: Map<string, number>
  /** Mind maps' (and their cards'), by map id; cards', by card id. */
  maps: Map<string, number>
  cards: Map<string, number>
}

const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1)

export const NO_COUNTS: CommentCounts = {
  total: 0,
  places: { board: 0, manuscript: 0, timeline: 0, map: 0, arcs: 0, characters: 0, elements: 0, story: 0 },
  chapters: new Map(),
  things: new Map(),
  maps: new Map(),
  cards: new Map(),
}

/** The open threads about the open draft, counted. */
export function countComments(threads: CommentThread[], draft: string): CommentCounts {
  const counts: CommentCounts = {
    total: 0,
    places: { ...NO_COUNTS.places },
    chapters: new Map(),
    things: new Map(),
    maps: new Map(),
    cards: new Map(),
  }
  const { places } = counts
  for (const t of threads) {
    if (t.resolved || !inDraft(t.target, draft)) continue
    counts.total++
    const target = t.target
    switch (target.kind) {
      case 'story':
        places.story++
        break
      case 'chapter':
        places.board++
        places.manuscript++
        bump(counts.chapters, target.id)
        break
      case 'text':
        places.manuscript++
        bump(counts.chapters, target.id)
        break
      case 'beat':
        places.board++
        places.timeline++
        bump(counts.things, target.id)
        break
      case 'arc':
        places.arcs++
        bump(counts.things, target.id)
        break
      case 'character':
        places.characters++
        bump(counts.things, target.id)
        break
      case 'element':
        places.elements++
        bump(counts.things, target.id)
        break
      case 'map':
        places.map++
        bump(counts.maps, target.id)
        if (target.node) bump(counts.cards, target.node)
        break
    }
  }
  return counts
}

/** The key a target is known by: two comments on the same thing share it. */
export function targetKey(t: CommentTarget): string {
  switch (t.kind) {
    case 'story':
      return 'story'
    case 'map':
      return t.node ? `map:${t.id}:${t.node}` : `map:${t.id}`
    case 'text':
      return `chapter:${t.id}`
    default:
      return `${t.kind}:${t.id}`
  }
}

/** Whether a thread is on this thing (a chapter's include its passages'; a map's, its cards'). */
export function isOn(t: CommentTarget, kind: TargetKind, id?: string, node?: string): boolean {
  if (kind === 'story') return t.kind === 'story'
  if (kind === 'chapter') return (t.kind === 'chapter' || t.kind === 'text') && t.id === id
  if (kind === 'map') return t.kind === 'map' && t.id === id && (node === undefined || t.node === node)
  return t.kind === kind && (t as { id?: string }).id === id
}

// ---------- In words ----------

const quoted = (s: string) => `“${s}”`

/** A mind map card, in words: "Sticky note “…”", "Card: Chapter 3: The Logbook". */
export function cardName(node: MapNode, data: StoryData, lookup: Lookup): string {
  const text = (s: string) => quoteLine(plainText(s, lookup), 60)
  switch (node.kind) {
    case 'note':
      return node.text.trim() ? `Sticky note ${quoted(text(node.text))}` : 'A sticky note'
    case 'text':
      return node.text.trim() ? `Text ${quoted(text(node.text))}` : 'A text box'
    case 'image':
      return 'A picture'
    case 'container':
      return node.title.trim() ? `Group ${quoted(text(node.title))}` : 'A group'
    default: {
      const found = thingName({ kind: node.kind, id: node.refId } as CommentTarget, data, lookup)
      return found ? `Card: ${found}` : 'A card'
    }
  }
}

/** A chapter, arc, beat, character or element's name, if it's in the story (the open draft) now. */
function thingName(t: CommentTarget, data: StoryData, lookup: Lookup): string | null {
  const named = (s: string, fallback: string) => plainText(s, lookup).trim() || fallback
  switch (t.kind) {
    case 'chapter':
    case 'text': {
      const i = data.chapters.findIndex((c) => c.id === t.id)
      if (i === -1) return null
      const title = named(data.chapters[i].title, '')
      return `Chapter ${i + 1}${title ? `: ${title}` : ''}`
    }
    case 'beat': {
      const beat = data.beats[t.id]
      return beat ? `Beat ${quoted(named(beat.title, 'Untitled beat'))}` : null
    }
    case 'arc': {
      const arc = data.arcs.find((a) => a.id === t.id)
      return arc ? `Arc ${quoted(named(arc.name, 'Untitled arc'))}` : null
    }
    case 'character': {
      const c = data.characters.find((x) => x.id === t.id)
      return c ? named(c.name, 'Unnamed character') : null
    }
    case 'element': {
      const e = data.elements.find((x) => x.id === t.id)
      return e ? named(e.name, `Unnamed ${ELEMENT_KIND_NAMES[e.kind]?.noun ?? 'item'}`) : null
    }
    default:
      return null
  }
}

/**
 * What a comment is on, in words ("Chapter 3: The Logbook", "Beat “The lamp
 * goes dark”", "Mind map “Plot” · Sticky note “…”"), and whether it's still
 * there: `gone` when it isn't (in the open draft), with what it was called.
 */
export function describeTarget(t: CommentTarget, data: StoryData, lookup: Lookup): { label: string; gone: boolean } {
  if (t.kind === 'story') return { label: 'The whole story', gone: false }
  if (t.kind === 'map') {
    const map = data.mindMaps.find((m) => m.id === t.id)
    if (!map) return { label: t.label || 'A mind map', gone: true }
    const mapName = `Mind map ${quoted(map.name.trim() || 'Untitled map')}`
    if (!t.node) return { label: mapName, gone: false }
    const node = map.nodes.find((n) => n.id === t.node)
    return node ? { label: `${mapName} · ${cardName(node, data, lookup)}`, gone: false } : { label: `${mapName} · ${t.label || 'a card'}`, gone: true }
  }
  const name = thingName(t, data, lookup)
  return name ? { label: name, gone: false } : { label: t.label || 'Something no longer in the story', gone: true }
}

/** What to keep as a target's name with the comment (for when it's gone). */
export function labelFor(t: CommentTarget, data: StoryData, lookup: Lookup): string {
  return describeTarget(t, data, lookup).label.slice(0, 300)
}

/** "Mara", "an editor", "Claude (AI)", "you". */
export function authorName(c: Pick<StoryComment, 'author' | 'mine'>, viewer: CommentAuthorKind): string {
  if (c.mine) return 'You'
  const name = c.author.name.trim()
  if (c.author.kind === 'writer') return viewer === 'writer' ? 'You' : name || 'The writer'
  if (c.author.kind === 'assistant') return name || 'AI assistant'
  return name || 'An editor'
}
