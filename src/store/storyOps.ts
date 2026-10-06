import type {
  Arc,
  Beat,
  Chapter,
  ChapterStatus,
  ChapterText,
  Character,
  CharacterAttribute,
  ElementKind,
  MapCardView,
  MapEdge,
  ContainerLayout,
  MapEntityKind,
  MapListStyle,
  MapNode,
  MapSize,
  MindMap,
  NoteColor,
  RichNode,
  StoryData,
  StoryElement,
  StoryGoals,
} from '../types'
import { IMAGE_ID, makeId } from '../lib/id'
import { displayName, linkTyped, lookupOf, mentionToken } from '../lib/mentions'
import { isDoc, stripBeatLinks, unlinkMentions } from '../lib/richText'
import { anchorItemId, cleanAnchor } from '../lib/anchors'
import { timeJumps } from '../lib/timeline'
import { TEXT_BOX_SIZE, cleanTextSize } from '../lib/textSize'
import { PAPER_NAMES, cleanColor } from '../lib/colors'

// Pure operations on StoryData. Every op returns a new object and keeps two
// invariants: a beat is listed in exactly its own arc's beatIds, and in the
// beatIds of its chapter (and no other chapter) when chapterId is set.
// References to characters (arc casts, chapter POVs, mentions) only ever
// point at characters that exist; mentions of elements likewise.

export type ChapterLayout = Record<string, string[]>

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items
  const next = items.slice()
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item)
  return next
}

function insertAt<T>(items: T[], item: T, index?: number): T[] {
  const next = items.slice()
  const i = index === undefined ? next.length : Math.max(0, Math.min(index, next.length))
  next.splice(i, 0, item)
  return next
}

function mapChapters(data: StoryData, fn: (c: Chapter) => Chapter): StoryData {
  return { ...data, chapters: data.chapters.map(fn) }
}

function mapArcs(data: StoryData, fn: (a: Arc) => Arc): StoryData {
  return { ...data, arcs: data.arcs.map(fn) }
}

function mapCharacters(data: StoryData, fn: (c: Character) => Character): StoryData {
  return { ...data, characters: data.characters.map(fn) }
}

function mapElements(data: StoryData, fn: (e: StoryElement) => StoryElement): StoryData {
  return { ...data, elements: data.elements.map(fn) }
}

/** Everything that can be @mentioned: characters first, then elements. */
export const mentionables = (data: Pick<StoryData, 'characters' | 'elements'>) => [...data.characters, ...data.elements]

/** Applies fn to every chapter's written text, keeping untouched entries as they are. */
function mapTexts(data: StoryData, fn: (doc: RichNode) => RichNode): StoryData {
  let texts = data.texts
  for (const [id, text] of Object.entries(data.texts)) {
    const doc = fn(text.doc)
    if (doc !== text.doc) {
      if (texts === data.texts) texts = { ...data.texts }
      texts[id] = { ...text, doc }
    }
  }
  return texts === data.texts ? data : { ...data, texts }
}

/** Applies fn to every text field that can hold mentions, keeping untouched objects as they are. */
export function mapStoryText(data: StoryData, fn: (text: string) => string): StoryData {
  const beats: Record<string, Beat> = {}
  for (const [id, b] of Object.entries(data.beats)) {
    const title = fn(b.title)
    const description = fn(b.description)
    beats[id] = title === b.title && description === b.description ? b : { ...b, title, description }
  }
  return {
    ...data,
    beats,
    chapters: data.chapters.map((c) => {
      const title = fn(c.title)
      const summary = fn(c.summary)
      return title === c.title && summary === c.summary ? c : { ...c, title, summary }
    }),
    arcs: data.arcs.map((a) => {
      const name = fn(a.name)
      const description = fn(a.description)
      return name === a.name && description === a.description ? a : { ...a, name, description }
    }),
    characters: data.characters.map((c) => mapDescribed(c, fn)),
    elements: data.elements.map((e) => mapDescribed(e, fn)),
    mindMaps: data.mindMaps.map((map) => {
      let changed = false
      const nodes = map.nodes.map((n) => {
        if (n.kind !== 'note' && n.kind !== 'text') return n
        const text = fn(n.text)
        if (text === n.text) return n
        changed = true
        return { ...n, text }
      })
      return changed ? { ...map, nodes } : map
    }),
  }
}

/** A character's or element's description and attribute values, through fn. */
function mapDescribed<T extends Character | StoryElement>(item: T, fn: (text: string) => string): T {
  const description = fn(item.description)
  let changed = description !== item.description
  const attributes = item.attributes.map((attr) => {
    const value = fn(attr.value)
    if (value === attr.value) return attr
    changed = true
    return { ...attr, value }
  })
  return changed ? { ...item, description, attributes } : item
}

/** Turns any plain `@Name` text that names a character or element into a real mention. */
export function linkMentions(data: StoryData): StoryData {
  const named = mentionables(data)
  const lookup = lookupOf(named)
  return mapStoryText(data, (text) => linkTyped(text, named, lookup).stored)
}

/** Turns every mention of a character or element into plain text with its name. */
function unmention(data: StoryData, id: string, name: string): StoryData {
  const token = mentionToken(id)
  return mapTexts(
    mapStoryText(data, (text) => (text.includes(token) ? text.replaceAll(token, name) : text)),
    (doc) => unlinkMentions(doc, id, name),
  )
}

// ---------- Chapters ----------

export function addChapter(
  data: StoryData,
  init: { title?: string; summary?: string; index?: number } = {},
): [StoryData, string] {
  const chapter: Chapter = {
    id: makeId('ch'),
    title: init.title ?? '',
    summary: init.summary ?? '',
    beatIds: [],
    povCharacterId: null,
    status: 'outline',
  }
  return [{ ...data, chapters: insertAt(data.chapters, chapter, init.index) }, chapter.id]
}

export function updateChapter(
  data: StoryData,
  id: string,
  patch: Partial<Pick<Chapter, 'title' | 'summary' | 'povCharacterId' | 'status' | 'targetWords'>>,
): StoryData {
  if (patch.povCharacterId && !data.characters.some((c) => c.id === patch.povCharacterId)) return data
  if (patch.status && !CHAPTER_STATUSES.includes(patch.status)) return data
  const target = 'targetWords' in patch ? cleanTarget(patch.targetWords) : undefined
  return mapChapters(data, (c) => {
    if (c.id !== id) return c
    const next = { ...c, ...patch }
    if ('targetWords' in patch) {
      if (target) next.targetWords = target
      else delete next.targetWords
    }
    return next
  })
}

/** Removes the chapter; its beats stay on their arcs, unassigned. */
export function deleteChapter(data: StoryData, id: string): StoryData {
  const chapter = data.chapters.find((c) => c.id === id)
  if (!chapter) return data
  const beats = { ...data.beats }
  for (const beatId of chapter.beatIds) {
    if (beats[beatId]) beats[beatId] = { ...beats[beatId], chapterId: null }
  }
  const { [id]: _removed, ...texts } = data.texts
  return dropMapRefs({ ...data, beats, texts, chapters: data.chapters.filter((c) => c.id !== id) }, new Set([id]))
}

/** Saves a chapter's written text. */
/** A local calendar day as YYYY-MM-DD. */
export function dayKey(time: number = Date.now()): string {
  const d = new Date(time)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Saves a chapter's text. The change in its word count is added to the
 * day's tally in the word log (`day` null to leave the log alone).
 */
export function setChapterText(
  data: StoryData,
  chapterId: string,
  text: ChapterText,
  day: string | null = dayKey(),
): StoryData {
  if (!data.chapters.some((c) => c.id === chapterId)) return data
  const next = { ...data, texts: { ...data.texts, [chapterId]: text } }
  const change = text.words - (data.texts[chapterId]?.words ?? 0)
  if (!day || !change) return next
  return { ...next, wordLog: { ...data.wordLog, [day]: (data.wordLog[day] ?? 0) + change } }
}

export function setGoals(data: StoryData, patch: StoryGoals): StoryData {
  const goals: StoryGoals = { ...data.goals }
  for (const key of ['draft', 'daily'] as const) {
    if (!(key in patch)) continue
    const value = cleanTarget(patch[key])
    if (value) goals[key] = value
    else delete goals[key]
  }
  return { ...data, goals }
}

/** A story with nothing in it yet. */
export function emptyStory(title = 'Untitled story'): StoryData {
  return {
    title,
    chapters: [],
    arcs: [],
    beats: {},
    characters: [],
    elements: [],
    texts: {},
    timeline: [],
    mindMaps: [defaultMindMap()],
    goals: {},
    wordLog: {},
  }
}

/** The map every story starts with. */
export const DEFAULT_MAP_ID = 'map_main'
export const defaultMindMap = (): MindMap => ({ id: DEFAULT_MAP_ID, name: 'Mind map', nodes: [], edges: [] })

export function moveChapter(data: StoryData, from: number, to: number): StoryData {
  return { ...data, chapters: moveItem(data.chapters, from, to) }
}

// ---------- Arcs ----------

export function addArc(
  data: StoryData,
  init: { name: string; color: string; description?: string; characterIds?: string[] },
): [StoryData, string] {
  const arc: Arc = {
    id: makeId('arc'),
    name: init.name,
    color: init.color,
    description: init.description ?? '',
    beatIds: [],
    characterIds: (init.characterIds ?? []).filter((id) => data.characters.some((c) => c.id === id)),
  }
  return [{ ...data, arcs: [...data.arcs, arc] }, arc.id]
}

export function updateArc(
  data: StoryData,
  id: string,
  patch: Partial<Pick<Arc, 'name' | 'color' | 'description'>>,
): StoryData {
  return mapArcs(data, (a) => (a.id === id ? { ...a, ...patch } : a))
}

/** Removes the arc together with all of its beats. */
export function deleteArc(data: StoryData, id: string): StoryData {
  const arc = data.arcs.find((a) => a.id === id)
  if (!arc) return data
  const doomed = new Set(arc.beatIds)
  const beats = { ...data.beats }
  for (const beatId of doomed) delete beats[beatId]
  const next = {
    ...mapTexts(data, (doc) => stripBeatLinks(doc, doomed)),
    beats,
    timeline: data.timeline.filter((b) => !doomed.has(b)),
    arcs: data.arcs.filter((a) => a.id !== id),
    chapters: data.chapters.map((c) =>
      c.beatIds.some((b) => doomed.has(b))
        ? { ...c, beatIds: c.beatIds.filter((b) => !doomed.has(b)) }
        : c,
    ),
  }
  return dropMapRefs(next, new Set([id, ...doomed]))
}

export function moveArc(data: StoryData, from: number, to: number): StoryData {
  return { ...data, arcs: moveItem(data.arcs, from, to) }
}

/** Adds a character to an arc's cast (on = true) or removes them. */
export function setArcCharacter(data: StoryData, arcId: string, characterId: string, on: boolean): StoryData {
  if (!data.characters.some((c) => c.id === characterId)) return data
  return mapArcs(data, (a) => {
    if (a.id !== arcId || a.characterIds.includes(characterId) === on) return a
    return {
      ...a,
      characterIds: on ? [...a.characterIds, characterId] : a.characterIds.filter((id) => id !== characterId),
    }
  })
}

// ---------- Characters ----------

export function addCharacter(
  data: StoryData,
  init: { name: string; color: string; description?: string; attributes?: { label: string; value: string }[] },
): [StoryData, string] {
  const character: Character = {
    id: makeId('chr'),
    name: init.name,
    color: init.color,
    description: init.description ?? '',
    attributes: (init.attributes ?? []).map((a) => ({ id: makeId('attr'), label: a.label, value: a.value })),
  }
  return [{ ...data, characters: [...data.characters, character] }, character.id]
}

export function updateCharacter(
  data: StoryData,
  id: string,
  patch: Partial<Pick<Character, 'name' | 'color' | 'description'>>,
): StoryData {
  return mapCharacters(data, (c) => (c.id === id ? { ...c, ...patch } : c))
}

/**
 * Removes a character: their mentions turn into their plain name, and they
 * leave every arc cast and chapter POV.
 */
export function deleteCharacter(data: StoryData, id: string): StoryData {
  const character = data.characters.find((c) => c.id === id)
  if (!character) return data
  const next = unmention(data, id, displayName(character))
  return dropMapRefs(
    {
      ...next,
      characters: next.characters.filter((c) => c.id !== id),
      arcs: next.arcs.map((a) =>
        a.characterIds.includes(id) ? { ...a, characterIds: a.characterIds.filter((c) => c !== id) } : a,
      ),
      chapters: next.chapters.map((c) => (c.povCharacterId === id ? { ...c, povCharacterId: null } : c)),
    },
    new Set([id, ...character.attributes.map((a) => a.id)]),
  )
}

export function moveCharacter(data: StoryData, from: number, to: number): StoryData {
  return { ...data, characters: moveItem(data.characters, from, to) }
}

// ---------- Elements (places, objects, groups…) ----------

export const ELEMENT_KINDS: ElementKind[] = ['place', 'object', 'group', 'other']

export function addElement(
  data: StoryData,
  init: {
    name: string
    kind: ElementKind
    color: string
    description?: string
    attributes?: { label: string; value: string }[]
  },
): [StoryData, string] {
  const element: StoryElement = {
    id: makeId('elm'),
    kind: ELEMENT_KINDS.includes(init.kind) ? init.kind : 'other',
    name: init.name,
    color: init.color,
    description: init.description ?? '',
    attributes: (init.attributes ?? []).map((a) => ({ id: makeId('attr'), label: a.label, value: a.value })),
  }
  return [{ ...data, elements: [...data.elements, element] }, element.id]
}

export function updateElement(
  data: StoryData,
  id: string,
  patch: Partial<Pick<StoryElement, 'name' | 'kind' | 'color' | 'description'>>,
): StoryData {
  if (patch.kind && !ELEMENT_KINDS.includes(patch.kind)) return data
  return mapElements(data, (e) => (e.id === id ? { ...e, ...patch } : e))
}

/** Gives a character or element a portrait (a stored picture's id), or takes it away (null). */
export function setPortrait(data: StoryData, ownerId: string, imageId: string | null): StoryData {
  if (imageId !== null && !IMAGE_ID.test(imageId)) return data
  const set = <T extends Character | StoryElement>(item: T): T => {
    if (item.id !== ownerId) return item
    if (imageId) return { ...item, portrait: imageId }
    const rest = { ...item }
    delete rest.portrait
    return rest
  }
  return ownerId.startsWith('elm_') ? mapElements(data, set) : mapCharacters(data, set)
}

/** Removes an element; its mentions turn into its plain name. */
export function deleteElement(data: StoryData, id: string): StoryData {
  const element = data.elements.find((e) => e.id === id)
  if (!element) return data
  const next = unmention(data, id, displayName(element))
  return dropMapRefs(
    { ...next, elements: next.elements.filter((e) => e.id !== id) },
    new Set([id, ...element.attributes.map((a) => a.id)]),
  )
}

// ---------- Attributes (of a character or an element) ----------

function mapAttributes(
  data: StoryData,
  ownerId: string,
  fn: (attributes: CharacterAttribute[]) => CharacterAttribute[],
): StoryData {
  if (data.characters.some((c) => c.id === ownerId)) {
    return mapCharacters(data, (c) => (c.id === ownerId ? { ...c, attributes: fn(c.attributes) } : c))
  }
  if (data.elements.some((e) => e.id === ownerId)) {
    return mapElements(data, (e) => (e.id === ownerId ? { ...e, attributes: fn(e.attributes) } : e))
  }
  return data
}

/** Adds an attribute to a character or element (`ownerId`). */
export function addAttribute(
  data: StoryData,
  ownerId: string,
  init: { label?: string; value?: string } = {},
): [StoryData, string] {
  const attribute: CharacterAttribute = { id: makeId('attr'), label: init.label ?? '', value: init.value ?? '' }
  return [mapAttributes(data, ownerId, (list) => [...list, attribute]), attribute.id]
}

export function updateAttribute(
  data: StoryData,
  ownerId: string,
  attributeId: string,
  patch: Partial<Pick<CharacterAttribute, 'label' | 'value'>>,
): StoryData {
  return mapAttributes(data, ownerId, (list) => list.map((a) => (a.id === attributeId ? { ...a, ...patch } : a)))
}

export function deleteAttribute(data: StoryData, ownerId: string, attributeId: string): StoryData {
  return dropMapRefs(
    mapAttributes(data, ownerId, (list) => list.filter((a) => a.id !== attributeId)),
    new Set([attributeId]),
  )
}

export function moveAttribute(data: StoryData, ownerId: string, from: number, to: number): StoryData {
  return mapAttributes(data, ownerId, (list) => moveItem(list, from, to))
}

export function moveArcBeat(data: StoryData, arcId: string, from: number, to: number): StoryData {
  return mapArcs(data, (a) => (a.id === arcId ? { ...a, beatIds: moveItem(a.beatIds, from, to) } : a))
}

// ---------- Beats ----------

/** [chapter number, index within chapter] for placed beats, used to order arcs. */
function positionOf(data: StoryData, beatId: string): [number, number] | null {
  const chapterId = data.beats[beatId]?.chapterId
  if (!chapterId) return null
  const ci = data.chapters.findIndex((c) => c.id === chapterId)
  if (ci === -1) return null
  return [ci, data.chapters[ci].beatIds.indexOf(beatId)]
}

function comparePos(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1]
}

/**
 * Where a beat that was just placed in a chapter should go in its arc's order:
 * after the last arc beat that happens no later than it, otherwise before the
 * first arc beat that happens after it, otherwise at the end.
 */
function arcIndexFor(data: StoryData, arc: Arc, beatId: string): number {
  const pos = positionOf(data, beatId)
  if (!pos) return arc.beatIds.length
  let lastBefore = -1
  let firstAfter = -1
  arc.beatIds.forEach((id, i) => {
    if (id === beatId) return
    const other = positionOf(data, id)
    if (!other) return
    if (comparePos(other, pos) <= 0) lastBefore = i
    else if (firstAfter === -1) firstAfter = i
  })
  if (lastBefore !== -1) return lastBefore + 1
  if (firstAfter !== -1) return firstAfter
  return arc.beatIds.length
}

export interface NewBeat {
  arcId: string
  title: string
  description?: string
  chapterId?: string | null
  /** Position inside the chapter; defaults to the end. */
  chapterIndex?: number
  /** Position inside the arc; defaults to the end, or to chapter order when placed in a chapter. */
  arcIndex?: number
  done?: boolean
}

export function addBeat(data: StoryData, init: NewBeat): [StoryData, string] {
  const arc = data.arcs.find((a) => a.id === init.arcId)
  if (!arc) throw new Error(`Unknown arc ${init.arcId}`)
  const chapterId =
    init.chapterId && data.chapters.some((c) => c.id === init.chapterId) ? init.chapterId : null
  const beat: Beat = {
    id: makeId('beat'),
    arcId: arc.id,
    title: init.title,
    description: init.description ?? '',
    chapterId,
    done: init.done ?? false,
  }
  let next: StoryData = { ...data, beats: { ...data.beats, [beat.id]: beat } }
  if (chapterId) {
    next = mapChapters(next, (c) =>
      c.id === chapterId ? { ...c, beatIds: insertAt(c.beatIds, beat.id, init.chapterIndex) } : c,
    )
  }
  const arcIndex = init.arcIndex ?? arcIndexFor(next, arc, beat.id)
  next = mapArcs(next, (a) =>
    a.id === arc.id ? { ...a, beatIds: insertAt(a.beatIds, beat.id, arcIndex) } : a,
  )
  return [next, beat.id]
}

export function updateBeat(
  data: StoryData,
  id: string,
  patch: Partial<Pick<Beat, 'title' | 'description' | 'done' | 'when'>>,
): StoryData {
  const beat = data.beats[id]
  if (!beat) return data
  const next: Beat = { ...beat, ...patch }
  if ('when' in patch) {
    const when = cleanWhen(patch.when)
    if (when) next.when = when
    else delete next.when
  }
  return { ...data, beats: { ...data.beats, [id]: next } }
}

/** A "when" label as kept: at most a line, and nothing when it's blank. */
function cleanWhen(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const line = value.replace(/[\r\n]+/g, ' ').slice(0, 120)
  return line.trim() ? line : undefined
}

/** Moves a beat to another arc, slotting it in by chapter order. */
export function setBeatArc(data: StoryData, id: string, arcId: string): StoryData {
  const beat = data.beats[id]
  const target = data.arcs.find((a) => a.id === arcId)
  if (!beat || !target || beat.arcId === arcId) return data
  let next: StoryData = {
    ...data,
    beats: { ...data.beats, [id]: { ...beat, arcId } },
  }
  next = mapArcs(next, (a) => (a.id === beat.arcId ? { ...a, beatIds: a.beatIds.filter((b) => b !== id) } : a))
  const index = arcIndexFor(next, target, id)
  return mapArcs(next, (a) => (a.id === arcId ? { ...a, beatIds: insertAt(a.beatIds, id, index) } : a))
}

/** Puts a beat into a chapter at an index (end by default), or unassigns it with null. */
export function placeBeat(
  data: StoryData,
  id: string,
  chapterId: string | null,
  index?: number,
): StoryData {
  const beat = data.beats[id]
  if (!beat) return data
  const target = chapterId ? data.chapters.find((c) => c.id === chapterId) : null
  if (chapterId && !target) return data
  const chapters = data.chapters.map((c) => {
    let beatIds = c.beatIds.includes(id) ? c.beatIds.filter((b) => b !== id) : c.beatIds
    if (c.id === chapterId) beatIds = insertAt(beatIds, id, index)
    return beatIds === c.beatIds ? c : { ...c, beatIds }
  })
  return {
    ...data,
    chapters,
    beats: { ...data.beats, [id]: { ...beat, chapterId: target ? target.id : null } },
  }
}

/**
 * Commits a full chapter -> beats layout (the result of a drag). Chapters
 * missing from the layout keep their beats; beats that drop out of every
 * chapter become unassigned.
 */
export function applyChapterLayout(data: StoryData, layout: ChapterLayout): StoryData {
  const chapters = data.chapters.map((c) => {
    const ids = layout[c.id]
    if (!ids) return c
    const valid = ids.filter((b) => data.beats[b])
    const same = valid.length === c.beatIds.length && valid.every((b, i) => c.beatIds[i] === b)
    return same ? c : { ...c, beatIds: valid }
  })
  const owner = new Map<string, string>()
  for (const c of chapters) for (const b of c.beatIds) owner.set(b, c.id)
  let beats = data.beats
  for (const beat of Object.values(data.beats)) {
    const chapterId = owner.get(beat.id) ?? null
    if (chapterId !== beat.chapterId) {
      if (beats === data.beats) beats = { ...data.beats }
      beats[beat.id] = { ...beat, chapterId }
    }
  }
  return { ...data, chapters, beats }
}

export function deleteBeat(data: StoryData, id: string): StoryData {
  const beat = data.beats[id]
  if (!beat) return data
  const beats = { ...data.beats }
  delete beats[id]
  return dropMapRefs(
    {
      ...mapTexts(data, (doc) => stripBeatLinks(doc, new Set([id]))),
      beats,
      timeline: data.timeline.includes(id) ? data.timeline.filter((b) => b !== id) : data.timeline,
      arcs: data.arcs.map((a) => (a.id === beat.arcId ? { ...a, beatIds: a.beatIds.filter((b) => b !== id) } : a)),
      chapters: beat.chapterId
        ? data.chapters.map((c) =>
            c.id === beat.chapterId ? { ...c, beatIds: c.beatIds.filter((b) => b !== id) } : c,
          )
        : data.chapters,
    },
    new Set([id]),
  )
}

// ---------- Timeline ----------

/** Beats in the order they're read: chapter by chapter, then those in no chapter, arc by arc. */
export function readingOrder(data: Pick<StoryData, 'chapters' | 'arcs' | 'beats'>): string[] {
  return [
    ...data.chapters.flatMap((c) => c.beatIds),
    ...data.arcs.flatMap((a) => a.beatIds.filter((b) => !data.beats[b]?.chapterId)),
  ].filter((b) => data.beats[b])
}

/**
 * Beats in the order they happen in the story's world: as arranged on the
 * timeline. Until it's arranged, that's the reading order. A beat not
 * arranged yet (a new one, say) happens just after everything read before it,
 * leaving out flashbacks and flash-forwards, which don't say when the story
 * around them is.
 */
export function storyOrder(data: Pick<StoryData, 'chapters' | 'arcs' | 'beats' | 'timeline'>): string[] {
  const reading = readingOrder(data)
  const seen = new Set<string>()
  const order = data.timeline.filter((b) => data.beats[b] && !seen.has(b) && !!seen.add(b))
  if (!order.length) return reading
  const jumps = timeJumps(order, data.chapters.flatMap((c) => c.beatIds))
  let latest: string | null = null
  for (const id of reading) {
    if (!seen.has(id)) {
      order.splice(latest ? order.indexOf(latest) + 1 : 0, 0, id)
      seen.add(id)
    }
    if (!jumps.has(id) && (!latest || order.indexOf(id) > order.indexOf(latest))) latest = id
  }
  return order
}

/** Moves a beat to another place in story time (an index in storyOrder). */
export function moveInTimeline(data: StoryData, beatId: string, to: number): StoryData {
  const order = storyOrder(data)
  const from = order.indexOf(beatId)
  if (from === -1) return data
  const moved = moveItem(order, from, to)
  return moved === order ? data : { ...data, timeline: moved }
}

/** Story time goes back to following the reading order. */
export function resetTimeline(data: StoryData): StoryData {
  return data.timeline.length ? { ...data, timeline: [] } : data
}

// ---------- Mind map ----------

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type NewMapNode = DistributiveOmit<MapNode, 'id'>
export type MapNodePatch = Partial<{
  x: number
  y: number
  width: number
  height: number
  text: string
  title: string
  color: NoteColor
  size: number | undefined
  bg: NoteColor | undefined
  list: MapListStyle | undefined
  checked: number[]
  layout: ContainerLayout
  expanded: MapCardView | undefined
  sizes: Partial<Record<MapCardView, MapSize>>
}>

const isEntity = (n: MapNode): n is Extract<MapNode, { refId: string }> => 'refId' in n

export const CONTAINER_LAYOUTS: ContainerLayout[] = ['vertical', 'horizontal', 'grid', 'free']
export const isContainer = (n: MapNode | NewMapNode): n is Extract<MapNode, { kind: 'container' }> => n.kind === 'container'
/** The container a card (or container) is on, if any. */
export const parentOf = (n: MapNode | NewMapNode): string | undefined => ('containerId' in n ? n.containerId : undefined)

/** A card put on a container, or taken off one with undefined. Its x and y are the caller's to make fit. */
function withParent<T extends MapNode>(node: T, containerId: string | undefined): T {
  if (containerId) return { ...node, containerId }
  const rest = { ...node } as T & { containerId?: string }
  delete rest.containerId
  return rest
}

/** Whether container `inside` is `id` itself or somewhere on it, so `id` can't go onto it. */
function isWithin(nodes: MapNode[], inside: string, id: string): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let at: string | undefined = inside
  for (let steps = 0; at && steps <= nodes.length; steps++) {
    if (at === id) return true
    const node = byId.get(at)
    at = node ? parentOf(node) : undefined
  }
  return false
}

/**
 * Moves a card in its map's list of cards, which is also the order cards
 * stack in on a container: before the card `before`, or (null) after the
 * last other card on its container.
 */
function placeAmong(nodes: MapNode[], id: string, before: string | null): MapNode[] {
  const node = nodes.find((n) => n.id === id)
  if (!node) return nodes
  const rest = nodes.filter((n) => n.id !== id)
  let at = before ? rest.findIndex((n) => n.id === before) : -1
  if (at === -1) {
    const parent = parentOf(node)
    const last = rest.findLastIndex((n) => parent !== undefined && parentOf(n) === parent)
    at = last === -1 ? rest.length : last + 1
  }
  return [...rest.slice(0, at), node, ...rest.slice(at)]
}

function refExists(data: StoryData, node: NewMapNode): boolean {
  if (!('refId' in node)) return true
  switch (node.kind) {
    case 'arc':
      return data.arcs.some((a) => a.id === node.refId)
    case 'chapter':
      return data.chapters.some((c) => c.id === node.refId)
    case 'character':
      return data.characters.some((c) => c.id === node.refId)
    case 'element':
      return data.elements.some((e) => e.id === node.refId)
    case 'beat':
      return !!data.beats[node.refId]
  }
}

/** Applies `fn` to every mind map; maps it leaves alone (and the story) keep their identity. */
function mapMaps(data: StoryData, fn: (map: MindMap) => MindMap): StoryData {
  let changed = false
  const mindMaps = data.mindMaps.map((m) => {
    const next = fn(m)
    if (next !== m) changed = true
    return next
  })
  return changed ? { ...data, mindMaps } : data
}

/** The map a card is on. */
export const mapOfNode = (data: StoryData, nodeId: string) =>
  data.mindMaps.find((m) => m.nodes.some((n) => n.id === nodeId))

/** A card, on whichever map it is. */
export function findMapNode(data: StoryData, nodeId: string): MapNode | undefined {
  for (const map of data.mindMaps) {
    const node = map.nodes.find((n) => n.id === nodeId)
    if (node) return node
  }
  return undefined
}

/** Removes mind map cards for deleted story items, with their lines. */
function dropMapRefs(data: StoryData, refIds: Set<string>): StoryData {
  const gone = data.mindMaps.flatMap((m) => m.nodes.filter((n) => isEntity(n) && refIds.has(n.refId)).map((n) => n.id))
  const next = gone.length ? removeMapNodes(data, gone) : data
  // Lines drawn from a deleted beat, attribute, arc or chapter inside a card go too.
  const anchoredToGone = (anchor?: string) => {
    const id = anchor ? anchorItemId(anchor) : null
    return !!id && refIds.has(id)
  }
  return mapMaps(next, (m) => {
    const edges = m.edges.filter((e) => !anchoredToGone(e.sourceAnchor) && !anchoredToGone(e.targetAnchor))
    return edges.length === m.edges.length ? m : { ...m, edges }
  })
}

/**
 * Adds a card to a map (the first map if none is given). One put on a
 * container goes before the card `before` there, or at the end.
 */
export function addMapNode(
  data: StoryData,
  node: NewMapNode,
  mapId?: string,
  before: string | null = null,
): [StoryData, string | null] {
  const target = data.mindMaps.find((m) => m.id === mapId) ?? data.mindMaps[0]
  if (!target || !refExists(data, node)) return [data, null]
  const parent = parentOf(node)
  const onContainer = !!parent && target.nodes.some((n) => n.id === parent && isContainer(n))
  const full = withParent({ ...node, id: makeId('node') } as MapNode, onContainer ? parent : undefined)
  const add = (m: MindMap) => {
    const nodes = [...m.nodes, full]
    return { ...m, nodes: onContainer ? placeAmong(nodes, full.id, before) : nodes }
  }
  return [mapMaps(data, (m) => (m === target ? add(m) : m)), full.id]
}

export function updateMapNode(data: StoryData, id: string, patch: MapNodePatch): StoryData {
  return mapMaps(data, (m) =>
    m.nodes.some((n) => n.id === id)
      ? { ...m, nodes: m.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as MapNode) : n)) }
      : m,
  )
}

/** Sets new positions for several cards at once (the end of a drag). */
export function moveMapNodes(data: StoryData, moves: Record<string, { x: number; y: number }>): StoryData {
  return mapMaps(data, (m) => {
    let changed = false
    const nodes = m.nodes.map((n) => {
      const move = moves[n.id]
      if (!move || (move.x === n.x && move.y === n.y)) return n
      changed = true
      return { ...n, x: move.x, y: move.y }
    })
    return changed ? { ...m, nodes } : m
  })
}

/** Where a dragged card ends up. */
export interface MapDrop {
  id: string
  x: number
  y: number
  /** The container it's now on (null for none); unchanged when absent. x and y are from its corner. */
  containerId?: string | null
  /** On a column or row: the card it goes before (null for the end); its place is kept when absent. */
  before?: string | null
}

/** The end of a drag: cards move, and go onto, along or off containers. */
export function dropMapNodes(data: StoryData, drops: MapDrop[]): StoryData {
  const byId = new Map(drops.map((d) => [d.id, d]))
  return mapMaps(data, (m) => {
    if (!m.nodes.some((n) => byId.has(n.id))) return m
    const containers = new Set(m.nodes.filter(isContainer).map((n) => n.id))
    let nodes = [...m.nodes]
    // One at a time, so no two dropped containers end up on each other.
    nodes.forEach((n, i) => {
      const drop = byId.get(n.id)
      if (!drop) return
      const moved = { ...n, x: drop.x, y: drop.y } as MapNode
      const onto = drop.containerId && containers.has(drop.containerId) && !isWithin(nodes, drop.containerId, n.id)
      nodes[i] = drop.containerId === undefined ? moved : withParent(moved, onto ? drop.containerId! : undefined)
    })
    for (const drop of drops) {
      if (drop.before !== undefined && drop.before !== drop.id) nodes = placeAmong(nodes, drop.id, drop.before)
    }
    return { ...m, nodes }
  })
}

/** How far down one card can be from another and still count as in its row. */
const ROW_SLACK = 60

/** Cards in the order they're read: row by row (roughly lined up is enough), left to right. */
function rowByRow(cards: MapNode[]): MapNode[] {
  const rows: MapNode[][] = []
  for (const card of [...cards].sort((a, b) => a.y - b.y)) {
    const row = rows[rows.length - 1]
    if (row && card.y - row[0].y < ROW_SLACK) row.push(card)
    else rows.push([card])
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x))
}

/**
 * Changes how a container lays out its cards. `positions` are where its cards
 * are on screen now (from its corner), so they stay put when it becomes
 * freeform; when it stacks them, they go in the order they're in now: down,
 * across, or row by row.
 */
export function setContainerLayout(
  data: StoryData,
  id: string,
  layout: ContainerLayout,
  positions: Record<string, { x: number; y: number }> = {},
): StoryData {
  if (!CONTAINER_LAYOUTS.includes(layout)) return data
  return mapMaps(data, (m) => {
    if (!m.nodes.some((n) => n.id === id && isContainer(n))) return m
    let nodes = m.nodes.map((n) => {
      if (n.id === id) return { ...n, layout } as MapNode
      const at = positions[n.id]
      return at && parentOf(n) === id ? { ...n, x: Math.round(at.x), y: Math.round(at.y) } : n
    })
    if (layout !== 'free') {
      const cards = nodes.filter((n) => parentOf(n) === id)
      const sorted =
        layout === 'grid'
          ? rowByRow(cards)
          : cards.sort(layout === 'horizontal' ? (a, b) => a.x - b.x || a.y - b.y : (a, b) => a.y - b.y || a.x - b.x)
      let k = 0
      nodes = nodes.map((n) => (parentOf(n) === id ? sorted[k++] : n))
    }
    return { ...m, nodes }
  })
}

/**
 * Takes cards off their maps (never deletes the story items), with their
 * lines. Cards on a container that goes stay on the map, on the container
 * that one was on, if any: at `place` (from that one's corner) if given.
 */
export function removeMapNodes(data: StoryData, ids: string[], place: Record<string, { x: number; y: number }> = {}): StoryData {
  const gone = new Set(ids)
  return mapMaps(data, (m) => {
    if (!m.nodes.some((n) => gone.has(n.id))) return m
    const byId = new Map(m.nodes.map((n) => [n.id, n]))
    const nodes = m.nodes
      .filter((n) => !gone.has(n.id))
      .map((n) => {
        let parent = parentOf(n)
        if (!parent || !gone.has(parent)) return n
        // Out to the nearest container that stays, adding up the corners of those that go.
        let { x, y } = n
        while (parent && gone.has(parent)) {
          const p = byId.get(parent)
          x += p?.x ?? 0
          y += p?.y ?? 0
          parent = p ? parentOf(p) : undefined
        }
        const at = place[n.id] ?? { x, y }
        return withParent({ ...n, x: Math.round(at.x), y: Math.round(at.y) } as MapNode, parent)
      })
    return { ...m, nodes, edges: m.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)) }
  })
}

/**
 * A container resized: its new size and place. Cards on a freeform one stay
 * where they are on the map, though its corner moved (they're placed from it).
 */
export function resizeContainer(data: StoryData, id: string, rect: { x: number; y: number; width: number; height: number }): StoryData {
  return mapMaps(data, (m) => {
    const box = m.nodes.find((n) => n.id === id)
    if (!box || !isContainer(box)) return m
    const dx = rect.x - box.x
    const dy = rect.y - box.y
    const nodes = m.nodes.map((n) => {
      if (n.id === id) return { ...n, ...rect } as MapNode
      return box.layout === 'free' && parentOf(n) === id && (dx || dy) ? { ...n, x: n.x - dx, y: n.y - dy } : n
    })
    return { ...m, nodes }
  })
}

/** Cards and the lines between them, as copied from a map. */
export interface CopiedMapItems {
  nodes: MapNode[]
  edges: MapEdge[]
}

/**
 * Adds copied cards to a map, moved by `offset`, with the lines between them.
 * Each card gets a new id (`idOf` picks it from the copied one's). The copies
 * come from the clipboard, so they're checked the way a loaded save is: cards
 * for things this story doesn't have are left out. Returns the new ids.
 */
export function pasteMapItems(
  data: StoryData,
  mapId: string,
  items: { nodes?: unknown; edges?: unknown },
  offset: { x: number; y: number },
  idOf: (copiedId: string) => string = () => makeId('node'),
): [StoryData, string[]] {
  const target = data.mindMaps.find((m) => m.id === mapId)
  if (!target) return [data, []]
  const checked = normalizeStory({ ...data, mindMaps: [{ id: mapId, name: target.name, nodes: items.nodes, edges: items.edges }] })
    .mindMaps[0]
  const ids = new Map(checked.nodes.map((n) => [n.id, idOf(n.id)]))
  const nodes = checked.nodes.map((n) => {
    const parent = parentOf(n)
    // Cards on a pasted container keep their place on it; the rest move over.
    if (parent) return withParent({ ...n, id: ids.get(n.id)! } as MapNode, ids.get(parent))
    return { ...n, id: ids.get(n.id)!, x: Math.round(n.x + offset.x), y: Math.round(n.y + offset.y) } as MapNode
  })
  if (!nodes.length) return [data, []]
  const edges = checked.edges.map((e) => ({ ...e, id: makeId('edge'), source: ids.get(e.source)!, target: ids.get(e.target)! }))
  const next = mapMaps(data, (m) => (m === target ? { ...m, nodes: [...m.nodes, ...nodes], edges: [...m.edges, ...edges] } : m))
  return [next, nodes.map((n) => n.id)]
}

/** Where inside each card a new line attaches (see lib/anchors). */
export interface EdgeAnchors {
  source?: string
  target?: string
}

/** A line joining a card to itself only makes sense between two different spots in it. */
const isLoop = (source: string, target: string, a: EdgeAnchors) =>
  source === target && (!a.source || !a.target || a.source === a.target)

/** Connects two cards on one map, or spots inside them; ignores loops and repeats of an existing line. */
export function addMapEdge(
  data: StoryData,
  source: string,
  target: string,
  anchors: EdgeAnchors = {},
): [StoryData, string | null] {
  const map = mapOfNode(data, source)
  const a = { source: cleanAnchor(anchors.source), target: cleanAnchor(anchors.target) }
  if (!map || isLoop(source, target, a) || !map.nodes.some((n) => n.id === target)) return [data, null]
  const exists = map.edges.some(
    (e) =>
      (e.source === source && e.target === target && e.sourceAnchor === a.source && e.targetAnchor === a.target) ||
      (e.source === target && e.target === source && e.sourceAnchor === a.target && e.targetAnchor === a.source),
  )
  if (exists) return [data, null]
  const edge: MapEdge = {
    id: makeId('edge'),
    source,
    target,
    label: '',
    arrow: false,
    ...(a.source ? { sourceAnchor: a.source } : {}),
    ...(a.target ? { targetAnchor: a.target } : {}),
  }
  return [mapMaps(data, (m) => (m === map ? { ...m, edges: [...m.edges, edge] } : m)), edge.id]
}

export function updateMapEdge(data: StoryData, id: string, patch: Partial<Pick<MapEdge, 'label' | 'arrow'>>): StoryData {
  return mapMaps(data, (m) =>
    m.edges.some((e) => e.id === id) ? { ...m, edges: m.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : m,
  )
}

export function removeMapEdges(data: StoryData, ids: string[]): StoryData {
  const gone = new Set(ids)
  return mapMaps(data, (m) => (m.edges.some((e) => gone.has(e.id)) ? { ...m, edges: m.edges.filter((e) => !gone.has(e.id)) } : m))
}

// ---------- Mind maps ----------

export function addMindMap(data: StoryData, name = 'Untitled map'): [StoryData, string] {
  const map: MindMap = { id: makeId('map'), name, nodes: [], edges: [] }
  return [{ ...data, mindMaps: [...data.mindMaps, map] }, map.id]
}

export function renameMindMap(data: StoryData, id: string, name: string): StoryData {
  return mapMaps(data, (m) => (m.id === id && m.name !== name ? { ...m, name } : m))
}

/** Deletes a map (never the story items on it). The last map is replaced by an empty one. */
export function deleteMindMap(data: StoryData, id: string): StoryData {
  if (!data.mindMaps.some((m) => m.id === id)) return data
  const rest = data.mindMaps.filter((m) => m.id !== id)
  return { ...data, mindMaps: rest.length ? rest : [{ ...defaultMindMap(), id: makeId('map') }] }
}

// ---------- Integrity ----------

export const CHAPTER_STATUSES: ChapterStatus[] = ['outline', 'draft', 'revised', 'done']

/** A word target: a whole number of words, or nothing. */
export function cleanTarget(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.min(10_000_000, Math.round(value)) : undefined
}

/** New sticky notes' colour, and new containers'. */
export const NOTE_COLOR = PAPER_NAMES.yellow
export const CONTAINER_COLOR = PAPER_NAMES.blue
export const MAP_LIST_STYLES: MapListStyle[] = ['bullet', 'number', 'check']
/** The ways each kind of card can open up on the mind map. */
export const MAP_CARD_VIEWS: Record<MapEntityKind, MapCardView[]> = {
  chapter: ['text', 'beats'],
  arc: ['beats'],
  character: ['details'],
  element: ['details'],
  beat: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)
const ids = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

/**
 * Coerces untrusted data (an import, or old saved state) into a valid story,
 * repairing any broken links between beats, arcs and chapters.
 */
export function normalizeStory(input: unknown): StoryData {
  const raw = isRecord(input) ? input : {}
  const list = (value: unknown) => (Array.isArray(value) ? value : []).filter(isRecord)
  const attributesOf = (value: unknown): CharacterAttribute[] =>
    list(value).map((a) => ({
      id: str(a.id) || makeId('attr'),
      label: str(a.label),
      value: str(a.value),
    }))
  const portraitOf = (value: unknown) => (IMAGE_ID.test(str(value)) ? { portrait: str(value) } : {})
  const characters: Character[] = list(raw.characters).map((c) => ({
    id: str(c.id) || makeId('chr'),
    name: str(c.name),
    color: str(c.color, '#6f7480'),
    description: str(c.description),
    attributes: attributesOf(c.attributes),
    ...portraitOf(c.portrait),
  }))
  const characterIds = new Set(characters.map((c) => c.id))
  const elements: StoryElement[] = list(raw.elements).map((e) => ({
    // Element ids start with elm_, which is how mentions of them are recognised.
    id: /^elm_[A-Za-z0-9_]+$/.test(str(e.id)) ? str(e.id) : makeId('elm'),
    kind: ELEMENT_KINDS.includes(e.kind as ElementKind) ? (e.kind as ElementKind) : 'other',
    name: str(e.name),
    color: str(e.color, '#6f7480'),
    description: str(e.description),
    attributes: attributesOf(e.attributes),
    ...portraitOf(e.portrait),
  }))
  const arcs: Arc[] = list(raw.arcs).map((a) => ({
    id: str(a.id) || makeId('arc'),
    name: str(a.name, 'Untitled arc'),
    color: str(a.color, '#6f7480'),
    description: str(a.description),
    beatIds: ids(a.beatIds),
    characterIds: [...new Set(ids(a.characterIds).filter((id) => characterIds.has(id)))],
  }))
  const rawChapters = list(raw.chapters)
  let chapters: Chapter[] = rawChapters.map((c) => {
    const chapter: Chapter = {
      id: str(c.id) || makeId('ch'),
      title: str(c.title),
      summary: str(c.summary),
      beatIds: ids(c.beatIds),
      povCharacterId: characterIds.has(str(c.povCharacterId)) ? str(c.povCharacterId) : null,
      status: CHAPTER_STATUSES.includes(c.status as ChapterStatus) ? (c.status as ChapterStatus) : 'outline',
    }
    const target = cleanTarget(c.targetWords)
    if (target) chapter.targetWords = target
    return chapter
  })
  const arcIds = new Set(arcs.map((a) => a.id))
  const chapterIds = new Set(chapters.map((c) => c.id))

  const beats: Record<string, Beat> = {}
  const rawBeats = isRecord(raw.beats) ? raw.beats : {}
  for (const [key, b] of Object.entries(rawBeats)) {
    if (!isRecord(b)) continue
    const arcId = str(b.arcId)
    if (!arcIds.has(arcId)) continue
    const id = str(b.id, key)
    const chapterId = str(b.chapterId)
    beats[id] = {
      id,
      arcId,
      title: str(b.title),
      description: str(b.description),
      chapterId: chapterIds.has(chapterId) ? chapterId : null,
      done: b.done === true,
    }
    const when = cleanWhen(b.when)
    if (when) beats[id].when = when
  }

  // Each beat appears once, in its own arc, keeping the stored order.
  for (const arc of arcs) {
    const seen = new Set<string>()
    arc.beatIds = arc.beatIds.filter((b) => {
      if (seen.has(b) || beats[b]?.arcId !== arc.id) return false
      seen.add(b)
      return true
    })
    for (const beat of Object.values(beats)) {
      if (beat.arcId === arc.id && !seen.has(beat.id)) arc.beatIds.push(beat.id)
    }
  }

  // Each placed beat appears once, in its own chapter.
  const placed = new Set<string>()
  for (const chapter of chapters) {
    chapter.beatIds = chapter.beatIds.filter((b) => {
      if (placed.has(b) || beats[b]?.chapterId !== chapter.id) return false
      placed.add(b)
      return true
    })
  }
  for (const beat of Object.values(beats)) {
    if (beat.chapterId && !placed.has(beat.id)) {
      chapters.find((c) => c.id === beat.chapterId)?.beatIds.push(beat.id)
    }
  }

  const texts: Record<string, ChapterText> = {}
  for (const [id, t] of Object.entries(isRecord(raw.texts) ? raw.texts : {})) {
    if (!chapterIds.has(id) || !isRecord(t) || !isDoc(t.doc)) continue
    texts[id] = {
      doc: t.doc,
      words: typeof t.words === 'number' ? t.words : 0,
      updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : 0,
    }
  }

  // Saves from before chapter status: a chapter with writing in it is a draft.
  chapters = chapters.map((c, i) =>
    !CHAPTER_STATUSES.includes(rawChapters[i].status as ChapterStatus) && texts[c.id]?.words ? { ...c, status: 'draft' } : c,
  )

  const refs: Record<string, Set<string>> = {
    arc: new Set(arcs.map((a) => a.id)),
    chapter: chapterIds,
    character: characterIds,
    element: new Set(elements.map((e) => e.id)),
    beat: new Set(Object.keys(beats)),
  }
  const num = (v: unknown, fallback: number, min = -1e7, max = 1e7) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
  const sizeOf = (value: unknown) => {
    const size = cleanTextSize(value)
    return size === undefined ? {} : { size }
  }
  /** A note's or text box's list style, and its ticked lines that still exist. */
  const listOf = (n: Record<string, unknown>, text: string): { list?: MapListStyle; checked?: number[] } => {
    const out: { list?: MapListStyle; checked?: number[] } = {}
    const style = str(n.list) as MapListStyle
    if (MAP_LIST_STYLES.includes(style)) out.list = style
    const lines = text.split('\n').length
    const checked = [...new Set(Array.isArray(n.checked) ? n.checked : [])]
      .filter((i): i is number => Number.isInteger(i) && i >= 0 && i < lines)
      .sort((a, b) => a - b)
    if (checked.length) out.checked = checked
    return out
  }
  // Saves from before several maps had one `mindMap`; it becomes the first map.
  const rawMaps: Record<string, unknown>[] = Array.isArray(raw.mindMaps)
    ? list(raw.mindMaps)
    : isRecord(raw.mindMap)
      ? [{ id: DEFAULT_MAP_ID, name: 'Mind map', ...raw.mindMap }]
      : []
  const seenNodes = new Set<string>()
  const seenMaps = new Set<string>()
  const mindMaps: MindMap[] = rawMaps.map((rawMap) => {
    let mapId = str(rawMap.id) || makeId('map')
    if (seenMaps.has(mapId)) mapId = makeId('map')
    seenMaps.add(mapId)
    const nodes: MapNode[] = []
    const parents = new Map<string, string>()
    // Saves from before containers held containers put cards on them by
    // parentId, with x and y on the map rather than from the container.
    const onMap = new Map<string, string>()
    for (const n of list(rawMap.nodes)) {
      const id = str(n.id) || makeId('node')
      if (typeof n.containerId === 'string') parents.set(id, n.containerId)
      else if (typeof n.parentId === 'string') onMap.set(id, n.parentId)
      const x = num(n.x, 0)
      const y = num(n.y, 0)
      const kind = str(n.kind)
      if (kind in refs) {
        const refId = str(n.refId)
        if (!refs[kind].has(refId)) continue
        const node: MapNode = { id, kind: kind as Extract<MapNode, { refId: string }>['kind'], refId, x, y }
        const views = MAP_CARD_VIEWS[kind as MapEntityKind]
        if (views.includes(n.expanded as MapCardView)) node.expanded = n.expanded as MapCardView
        const rawSizes = isRecord(n.sizes) ? n.sizes : {}
        const sizes: Partial<Record<MapCardView, MapSize>> = {}
        for (const view of views) {
          const size = rawSizes[view]
          if (isRecord(size) && typeof size.width === 'number' && typeof size.height === 'number') {
            sizes[view] = { width: num(size.width, 300, 160, 4000), height: num(size.height, 300, 120, 4000) }
          }
        }
        if (Object.keys(sizes).length) node.sizes = sizes
        nodes.push(node)
      } else if (kind === 'note') {
        const text = str(n.text)
        nodes.push({
          id,
          kind,
          x,
          y,
          width: num(n.width, 220, 80, 2000),
          height: num(n.height, 160, 60, 2000),
          text,
          color: cleanColor(n.color) ?? NOTE_COLOR,
          ...sizeOf(n.size),
          ...listOf(n, text),
        })
      } else if (kind === 'image') {
        const imageId = str(n.imageId)
        if (!IMAGE_ID.test(imageId)) continue
        nodes.push({ id, kind, x, y, width: num(n.width, 240, 30, 4000), height: num(n.height, 180, 30, 4000), imageId })
      } else if (kind === 'container') {
        const layout = str(n.layout) as ContainerLayout
        nodes.push({
          id,
          kind,
          x,
          y,
          title: str(n.title).slice(0, 500),
          width: num(n.width, 360, 80, 8000),
          height: num(n.height, 260, 60, 8000),
          color: cleanColor(n.color) ?? CONTAINER_COLOR,
          layout: CONTAINER_LAYOUTS.includes(layout) ? layout : 'vertical',
        })
      } else if (kind === 'text') {
        const text = str(n.text)
        const node: MapNode = {
          id,
          kind,
          x,
          y,
          width: num(n.width, 280, 60, 3000),
          text,
          // Saves from before sizes could be set say small, medium or large.
          size: cleanTextSize(n.size) ?? TEXT_BOX_SIZE,
        }
        const bg = cleanColor(n.bg)
        if (bg) node.bg = bg
        nodes.push({ ...node, ...listOf(n, text) })
      }
    }
    // Cards (and containers) on a container that's on this map, never round in a circle.
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const isBox = (id: string | undefined) => !!id && byId.get(id)?.kind === 'container'
    for (const node of nodes) {
      const parent = parents.get(node.id)
      const old = onMap.get(node.id)
      if (parent && parent !== node.id && isBox(parent)) (node as { containerId?: string }).containerId = parent
      else if (old && isBox(old) && !isContainer(node)) {
        const box = byId.get(old)!
        Object.assign(node, { containerId: old, x: node.x - box.x, y: node.y - box.y })
      }
    }
    for (const node of nodes) {
      if (parentOf(node) && isWithin(nodes, parentOf(node)!, node.id)) delete (node as { containerId?: string }).containerId
    }
    const nodeIds = new Set(nodes.map((n) => n.id))
    const edges: MapEdge[] = list(rawMap.edges)
      .map((e) => {
        const edge: MapEdge = {
          id: str(e.id) || makeId('edge'),
          source: str(e.source),
          target: str(e.target),
          label: str(e.label),
          arrow: e.arrow === true,
        }
        const sourceAnchor = cleanAnchor(e.sourceAnchor)
        const targetAnchor = cleanAnchor(e.targetAnchor)
        if (sourceAnchor) edge.sourceAnchor = sourceAnchor
        if (targetAnchor) edge.targetAnchor = targetAnchor
        return edge
      })
      .filter(
        (e) =>
          !isLoop(e.source, e.target, { source: e.sourceAnchor, target: e.targetAnchor }) &&
          nodeIds.has(e.source) &&
          nodeIds.has(e.target),
      )

    // Card ids must be unique across maps (a copied map in a hand-edited save, say).
    const renamed = new Map<string, string>()
    for (const n of nodes) {
      if (seenNodes.has(n.id)) {
        const fresh = makeId('node')
        renamed.set(n.id, fresh)
        n.id = fresh
      }
      seenNodes.add(n.id)
    }
    for (const n of nodes) {
      const parent = parentOf(n)
      if (parent && renamed.has(parent)) (n as { containerId?: string }).containerId = renamed.get(parent)
    }
    const mapEdges = edges.map((e) =>
      renamed.size ? { ...e, source: renamed.get(e.source) ?? e.source, target: renamed.get(e.target) ?? e.target } : e,
    )
    return { id: mapId, name: str(rawMap.name).trim() || 'Untitled map', nodes, edges: mapEdges }
  })
  if (!mindMaps.length) mindMaps.push(defaultMindMap())

  const rawGoals = isRecord(raw.goals) ? raw.goals : {}
  const goals: StoryGoals = {}
  const draft = cleanTarget(rawGoals.draft)
  const daily = cleanTarget(rawGoals.daily)
  if (draft) goals.draft = draft
  if (daily) goals.daily = daily
  // The log keeps the last year or so of days.
  const wordLog = Object.fromEntries(
    Object.entries(isRecord(raw.wordLog) ? raw.wordLog : {})
      .filter(([day, n]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && typeof n === 'number' && Number.isFinite(n))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-400)
      .map(([day, n]) => [day, Math.round(n as number)]),
  )

  return linkMentions({
    title: str(raw.title, 'Untitled story'),
    arcs,
    chapters,
    beats,
    characters,
    elements,
    texts,
    timeline: [...new Set(ids(raw.timeline))].filter((b) => beats[b]),
    mindMaps,
    goals,
    wordLog,
  })
}
