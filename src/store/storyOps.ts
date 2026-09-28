import type { Arc, Beat, Chapter, Character, CharacterAttribute, StoryData } from '../types'
import { makeId } from '../lib/id'
import { displayName, lookupOf, mentionToken, toDisplay, toStored } from '../lib/mentions'

// Pure operations on StoryData. Every op returns a new object and keeps two
// invariants: a beat is listed in exactly its own arc's beatIds, and in the
// beatIds of its chapter (and no other chapter) when chapterId is set.
// References to characters (arc casts, chapter POVs, mentions) only ever
// point at characters that exist.

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
    characters: data.characters.map((c) => {
      const description = fn(c.description)
      let changed = description !== c.description
      const attributes = c.attributes.map((attr) => {
        const value = fn(attr.value)
        if (value === attr.value) return attr
        changed = true
        return { ...attr, value }
      })
      return changed ? { ...c, description, attributes } : c
    }),
  }
}

/** Turns any plain `@Name` text that names a character into a real mention. */
export function linkMentions(data: StoryData): StoryData {
  const lookup = lookupOf(data.characters)
  return mapStoryText(data, (text) => toStored(toDisplay(text, lookup), data.characters))
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
  }
  return [{ ...data, chapters: insertAt(data.chapters, chapter, init.index) }, chapter.id]
}

export function updateChapter(
  data: StoryData,
  id: string,
  patch: Partial<Pick<Chapter, 'title' | 'summary' | 'povCharacterId'>>,
): StoryData {
  if (patch.povCharacterId && !data.characters.some((c) => c.id === patch.povCharacterId)) return data
  return mapChapters(data, (c) => (c.id === id ? { ...c, ...patch } : c))
}

/** Removes the chapter; its beats stay on their arcs, unassigned. */
export function deleteChapter(data: StoryData, id: string): StoryData {
  const chapter = data.chapters.find((c) => c.id === id)
  if (!chapter) return data
  const beats = { ...data.beats }
  for (const beatId of chapter.beatIds) {
    if (beats[beatId]) beats[beatId] = { ...beats[beatId], chapterId: null }
  }
  return { ...data, beats, chapters: data.chapters.filter((c) => c.id !== id) }
}

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
  return {
    ...data,
    beats,
    arcs: data.arcs.filter((a) => a.id !== id),
    chapters: data.chapters.map((c) =>
      c.beatIds.some((b) => doomed.has(b))
        ? { ...c, beatIds: c.beatIds.filter((b) => !doomed.has(b)) }
        : c,
    ),
  }
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
  const token = mentionToken(id)
  const name = displayName(character)
  const next = mapStoryText(data, (text) => (text.includes(token) ? text.replaceAll(token, name) : text))
  return {
    ...next,
    characters: next.characters.filter((c) => c.id !== id),
    arcs: next.arcs.map((a) =>
      a.characterIds.includes(id) ? { ...a, characterIds: a.characterIds.filter((c) => c !== id) } : a,
    ),
    chapters: next.chapters.map((c) => (c.povCharacterId === id ? { ...c, povCharacterId: null } : c)),
  }
}

export function moveCharacter(data: StoryData, from: number, to: number): StoryData {
  return { ...data, characters: moveItem(data.characters, from, to) }
}

function mapAttributes(
  data: StoryData,
  characterId: string,
  fn: (attributes: CharacterAttribute[]) => CharacterAttribute[],
): StoryData {
  return mapCharacters(data, (c) => (c.id === characterId ? { ...c, attributes: fn(c.attributes) } : c))
}

export function addAttribute(
  data: StoryData,
  characterId: string,
  init: { label?: string; value?: string } = {},
): [StoryData, string] {
  const attribute: CharacterAttribute = { id: makeId('attr'), label: init.label ?? '', value: init.value ?? '' }
  return [mapAttributes(data, characterId, (list) => [...list, attribute]), attribute.id]
}

export function updateAttribute(
  data: StoryData,
  characterId: string,
  attributeId: string,
  patch: Partial<Pick<CharacterAttribute, 'label' | 'value'>>,
): StoryData {
  return mapAttributes(data, characterId, (list) => list.map((a) => (a.id === attributeId ? { ...a, ...patch } : a)))
}

export function deleteAttribute(data: StoryData, characterId: string, attributeId: string): StoryData {
  return mapAttributes(data, characterId, (list) => list.filter((a) => a.id !== attributeId))
}

export function moveAttribute(data: StoryData, characterId: string, from: number, to: number): StoryData {
  return mapAttributes(data, characterId, (list) => moveItem(list, from, to))
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
  patch: Partial<Pick<Beat, 'title' | 'description'>>,
): StoryData {
  const beat = data.beats[id]
  if (!beat) return data
  return { ...data, beats: { ...data.beats, [id]: { ...beat, ...patch } } }
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
  return {
    ...data,
    beats,
    arcs: data.arcs.map((a) => (a.id === beat.arcId ? { ...a, beatIds: a.beatIds.filter((b) => b !== id) } : a)),
    chapters: beat.chapterId
      ? data.chapters.map((c) =>
          c.id === beat.chapterId ? { ...c, beatIds: c.beatIds.filter((b) => b !== id) } : c,
        )
      : data.chapters,
  }
}

// ---------- Integrity ----------

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
  const characters: Character[] = list(raw.characters).map((c) => ({
    id: str(c.id) || makeId('chr'),
    name: str(c.name),
    color: str(c.color, '#6f7480'),
    description: str(c.description),
    attributes: list(c.attributes).map((a) => ({
      id: str(a.id) || makeId('attr'),
      label: str(a.label),
      value: str(a.value),
    })),
  }))
  const characterIds = new Set(characters.map((c) => c.id))
  const arcs: Arc[] = list(raw.arcs).map((a) => ({
    id: str(a.id) || makeId('arc'),
    name: str(a.name, 'Untitled arc'),
    color: str(a.color, '#6f7480'),
    description: str(a.description),
    beatIds: ids(a.beatIds),
    characterIds: [...new Set(ids(a.characterIds).filter((id) => characterIds.has(id)))],
  }))
  const chapters: Chapter[] = list(raw.chapters).map((c) => ({
    id: str(c.id) || makeId('ch'),
    title: str(c.title),
    summary: str(c.summary),
    beatIds: ids(c.beatIds),
    povCharacterId: characterIds.has(str(c.povCharacterId)) ? str(c.povCharacterId) : null,
  }))
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
    }
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

  return linkMentions({ title: str(raw.title, 'Untitled story'), arcs, chapters, beats, characters })
}
