import type {
  Arc,
  Beat,
  Chapter,
  ChapterStatus,
  ChapterText,
  Character,
  CharacterAttribute,
  MapCardView,
  MapEdge,
  MapEntityKind,
  MapListStyle,
  MapNode,
  MapSize,
  NoteColor,
  RichNode,
  StoryData,
  TextSize,
} from '../types'
import { makeId } from '../lib/id'
import { displayName, linkTyped, lookupOf, mentionToken } from '../lib/mentions'
import { isDoc, stripBeatLinks, unlinkMentions } from '../lib/richText'
import { anchorItemId, cleanAnchor } from '../lib/anchors'

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
    mindMap: (() => {
      let changed = false
      const nodes = data.mindMap.nodes.map((n) => {
        if (n.kind !== 'note' && n.kind !== 'text') return n
        const text = fn(n.text)
        if (text === n.text) return n
        changed = true
        return { ...n, text }
      })
      return changed ? { ...data.mindMap, nodes } : data.mindMap
    })(),
  }
}

/** Turns any plain `@Name` text that names a character into a real mention. */
export function linkMentions(data: StoryData): StoryData {
  const lookup = lookupOf(data.characters)
  return mapStoryText(data, (text) => linkTyped(text, data.characters, lookup).stored)
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
export function setChapterText(data: StoryData, chapterId: string, text: ChapterText): StoryData {
  if (!data.chapters.some((c) => c.id === chapterId)) return data
  return { ...data, texts: { ...data.texts, [chapterId]: text } }
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
  const next = {
    ...mapTexts(data, (doc) => stripBeatLinks(doc, doomed)),
    beats,
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
  const token = mentionToken(id)
  const name = displayName(character)
  const next = mapTexts(
    mapStoryText(data, (text) => (text.includes(token) ? text.replaceAll(token, name) : text)),
    (doc) => unlinkMentions(doc, id, name),
  )
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
  return dropMapRefs(
    mapAttributes(data, characterId, (list) => list.filter((a) => a.id !== attributeId)),
    new Set([attributeId]),
  )
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
  patch: Partial<Pick<Beat, 'title' | 'description' | 'done'>>,
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
  return dropMapRefs(
    {
      ...mapTexts(data, (doc) => stripBeatLinks(doc, new Set([id]))),
      beats,
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

// ---------- Mind map ----------

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type NewMapNode = DistributiveOmit<MapNode, 'id'>
export type MapNodePatch = Partial<{
  x: number
  y: number
  width: number
  height: number
  text: string
  color: NoteColor
  size: TextSize
  bg: NoteColor | undefined
  list: MapListStyle | undefined
  checked: number[]
  expanded: MapCardView | undefined
  sizes: Partial<Record<MapCardView, MapSize>>
}>

const isEntity = (n: MapNode): n is Extract<MapNode, { refId: string }> => 'refId' in n

function refExists(data: StoryData, node: NewMapNode): boolean {
  if (!('refId' in node)) return true
  switch (node.kind) {
    case 'arc':
      return data.arcs.some((a) => a.id === node.refId)
    case 'chapter':
      return data.chapters.some((c) => c.id === node.refId)
    case 'character':
      return data.characters.some((c) => c.id === node.refId)
    case 'beat':
      return !!data.beats[node.refId]
  }
}

/** Removes mind map cards for deleted story items, with their lines. */
function dropMapRefs(data: StoryData, refIds: Set<string>): StoryData {
  const gone = new Set(data.mindMap.nodes.filter((n) => isEntity(n) && refIds.has(n.refId)).map((n) => n.id))
  const next = gone.size ? removeMapNodes(data, [...gone]) : data
  // Lines drawn from a deleted beat, attribute, arc or chapter inside a card go too.
  const anchoredToGone = (anchor?: string) => {
    const id = anchor ? anchorItemId(anchor) : null
    return !!id && refIds.has(id)
  }
  const edges = next.mindMap.edges.filter((e) => !anchoredToGone(e.sourceAnchor) && !anchoredToGone(e.targetAnchor))
  return edges.length === next.mindMap.edges.length ? next : { ...next, mindMap: { ...next.mindMap, edges } }
}

export function addMapNode(data: StoryData, node: NewMapNode): [StoryData, string | null] {
  if (!refExists(data, node)) return [data, null]
  const full = { ...node, id: makeId('node') } as MapNode
  return [{ ...data, mindMap: { ...data.mindMap, nodes: [...data.mindMap.nodes, full] } }, full.id]
}

export function updateMapNode(data: StoryData, id: string, patch: MapNodePatch): StoryData {
  return {
    ...data,
    mindMap: {
      ...data.mindMap,
      nodes: data.mindMap.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as MapNode) : n)),
    },
  }
}

/** Sets new positions for several cards at once (the end of a drag). */
export function moveMapNodes(data: StoryData, moves: Record<string, { x: number; y: number }>): StoryData {
  let changed = false
  const nodes = data.mindMap.nodes.map((n) => {
    const m = moves[n.id]
    if (!m || (m.x === n.x && m.y === n.y)) return n
    changed = true
    return { ...n, x: m.x, y: m.y }
  })
  return changed ? { ...data, mindMap: { ...data.mindMap, nodes } } : data
}

/** Takes cards off the map (never deletes the story items), with their lines. */
export function removeMapNodes(data: StoryData, ids: string[]): StoryData {
  const gone = new Set(ids)
  return {
    ...data,
    mindMap: {
      nodes: data.mindMap.nodes.filter((n) => !gone.has(n.id)),
      edges: data.mindMap.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)),
    },
  }
}

/** Where inside each card a new line attaches (see lib/anchors). */
export interface EdgeAnchors {
  source?: string
  target?: string
}

/** A line joining a card to itself only makes sense between two different spots in it. */
const isLoop = (source: string, target: string, a: EdgeAnchors) =>
  source === target && (!a.source || !a.target || a.source === a.target)

/** Connects two cards, or spots inside them; ignores loops and repeats of an existing line. */
export function addMapEdge(
  data: StoryData,
  source: string,
  target: string,
  anchors: EdgeAnchors = {},
): [StoryData, string | null] {
  const ids = new Set(data.mindMap.nodes.map((n) => n.id))
  const a = { source: cleanAnchor(anchors.source), target: cleanAnchor(anchors.target) }
  if (isLoop(source, target, a) || !ids.has(source) || !ids.has(target)) return [data, null]
  const exists = data.mindMap.edges.some(
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
  return [{ ...data, mindMap: { ...data.mindMap, edges: [...data.mindMap.edges, edge] } }, edge.id]
}

export function updateMapEdge(data: StoryData, id: string, patch: Partial<Pick<MapEdge, 'label' | 'arrow'>>): StoryData {
  return {
    ...data,
    mindMap: { ...data.mindMap, edges: data.mindMap.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) },
  }
}

export function removeMapEdges(data: StoryData, ids: string[]): StoryData {
  const gone = new Set(ids)
  return { ...data, mindMap: { ...data.mindMap, edges: data.mindMap.edges.filter((e) => !gone.has(e.id)) } }
}

// ---------- Integrity ----------

export const CHAPTER_STATUSES: ChapterStatus[] = ['outline', 'draft', 'revised', 'done']

/** A word target: a whole number of words, or nothing. */
export function cleanTarget(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.min(10_000_000, Math.round(value)) : undefined
}

export const NOTE_COLORS: NoteColor[] = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'white']
export const MAP_LIST_STYLES: MapListStyle[] = ['bullet', 'number', 'check']
/** The ways each kind of card can open up on the mind map. */
export const MAP_CARD_VIEWS: Record<MapEntityKind, MapCardView[]> = {
  chapter: ['text', 'beats'],
  arc: ['beats'],
  character: ['details'],
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
    beat: new Set(Object.keys(beats)),
  }
  const num = (v: unknown, fallback: number, min = -1e7, max = 1e7) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
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
  const rawMap = isRecord(raw.mindMap) ? raw.mindMap : {}
  const nodes: MapNode[] = []
  for (const n of list(rawMap.nodes)) {
    const id = str(n.id) || makeId('node')
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
      const color = str(n.color) as NoteColor
      const text = str(n.text)
      nodes.push({
        id,
        kind,
        x,
        y,
        width: num(n.width, 220, 80, 2000),
        height: num(n.height, 160, 60, 2000),
        text,
        color: NOTE_COLORS.includes(color) ? color : 'yellow',
        ...listOf(n, text),
      })
    } else if (kind === 'text') {
      const size = str(n.size) as TextSize
      const text = str(n.text)
      const node: MapNode = {
        id,
        kind,
        x,
        y,
        width: num(n.width, 280, 60, 3000),
        text,
        size: size === 'sm' || size === 'lg' ? size : 'md',
      }
      const bg = str(n.bg) as NoteColor
      if (NOTE_COLORS.includes(bg)) node.bg = bg
      nodes.push({ ...node, ...listOf(n, text) })
    }
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

  return linkMentions({
    title: str(raw.title, 'Untitled story'),
    arcs,
    chapters,
    beats,
    characters,
    texts,
    mindMap: { nodes, edges },
  })
}
