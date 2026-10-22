import type { Arc, ArchiveKind, ArchivedItem, Beat, Chapter, MapEdge, MapNode, StoryData } from '../types'
import { anchorItemId } from '../lib/anchors'
import { inOpenDraft, mainOf } from '../lib/archived'
import { idsElsewhere } from '../lib/drafts'
import { makeId } from '../lib/id'
import { defaultMindMap, isContainer, normalizeStory } from './storyOps'

// Archiving: a chapter, arc, beat, character, place (or other element) or
// mind map taken out of the story, with what goes with it (a chapter's text
// and beats, an arc's beats, its cards on the maps) and a note of where it
// all was, and kept in the story's archive until it's brought back, in its
// place, or deleted for good.
//
// Archived things depend on each other (a beat archived from an arc that's
// archived since), so bringing one back, or deleting one, is done with
// everything back in the story: all of it put back, newest first, so each
// goes back into the story as it was when it was taken; the change made;
// and the rest archived again, oldest first.

const noted = (item: ArchivedItem, key: string, list: string[]) => {
  if (!(key in item.places)) item.places[key] = list
}

/**
 * Takes a thing out of the story into an archived item. Re-archiving a
 * chapter, `only` are the beats that went with it before: others put in it
 * since stay in the story, in no chapter.
 */
function takeOut(data: StoryData, kind: ArchiveKind, id: string, at: number, only?: Set<string>): [StoryData, ArchivedItem] | null {
  const item: ArchivedItem = {
    kind,
    id,
    at,
    chapters: [],
    arcs: [],
    beats: [],
    characters: [],
    elements: [],
    mindMaps: [],
    texts: {},
    places: {},
    povs: [],
    untils: {},
    steps: {},
    cards: [],
    // (A chapter, arc or beat is its draft's.)
    ...(kind === 'chapter' || kind === 'arc' || kind === 'beat' ? { draft: data.draft } : {}),
  }
  let next = data
  let beatIds: string[] = []
  const refs = new Set([id])

  if (kind === 'chapter') {
    const chapter = data.chapters.find((c) => c.id === id)
    if (!chapter) return null
    item.chapters = [chapter]
    item.places.chapters = data.chapters.map((c) => c.id)
    const { [id]: text, ...texts } = data.texts
    if (text) item.texts[id] = text
    beatIds = chapter.beatIds.filter((b) => data.beats[b] && (!only || only.has(b)))
    const staying = chapter.beatIds.filter((b) => data.beats[b] && !beatIds.includes(b))
    let beats = data.beats
    if (staying.length) {
      beats = { ...beats }
      for (const b of staying) beats[b] = { ...beats[b], chapterId: null }
    }
    next = { ...next, chapters: data.chapters.filter((c) => c.id !== id), texts, beats }
  } else if (kind === 'arc') {
    const arc = data.arcs.find((a) => a.id === id)
    if (!arc) return null
    item.arcs = [arc]
    item.places.arcs = data.arcs.map((a) => a.id)
    beatIds = arc.beatIds.filter((b) => data.beats[b])
    next = { ...next, arcs: data.arcs.filter((a) => a.id !== id) }
  } else if (kind === 'beat') {
    if (!data.beats[id]) return null
    beatIds = [id]
  } else if (kind === 'character') {
    const character = data.characters.find((c) => c.id === id)
    if (!character) return null
    item.characters = [character]
    item.places.characters = data.characters.map((c) => c.id)
    for (const a of character.attributes) refs.add(a.id)
    item.povs = data.chapters.filter((c) => c.povCharacterId === id).map((c) => c.id)
    next = {
      ...next,
      characters: data.characters.filter((c) => c.id !== id),
      chapters: item.povs.length ? data.chapters.map((c) => (c.povCharacterId === id ? { ...c, povCharacterId: null } : c)) : data.chapters,
      arcs: data.arcs.map((a) => {
        if (!a.characterIds.includes(id)) return a
        noted(item, `arc-cast:${a.id}`, a.characterIds)
        return { ...a, characterIds: a.characterIds.filter((c) => c !== id) }
      }),
    }
  } else if (kind === 'element') {
    const element = data.elements.find((e) => e.id === id)
    if (!element) return null
    item.elements = [element]
    item.places.elements = data.elements.map((e) => e.id)
    for (const a of element.attributes) refs.add(a.id)
    next = { ...next, elements: data.elements.filter((e) => e.id !== id) }
  } else {
    const map = data.mindMaps.find((m) => m.id === id)
    if (!map) return null
    item.mindMaps = [map]
    item.places.mindMaps = data.mindMaps.map((m) => m.id)
    const rest = data.mindMaps.filter((m) => m.id !== id)
    if (rest.length) return [{ ...next, mindMaps: rest }, item]
    // There's always a map to draw on: an empty one stands in for it (until it's back, if it's still empty).
    const standIn = { ...defaultMindMap(), id: makeId('map') }
    item.places.standIn = [standIn.id]
    return [{ ...next, mindMaps: [standIn] }, item]
  }

  // Its beats go with it: out of their arcs' and chapters' lists (those staying), story time and outlines.
  if (beatIds.length) {
    const gone = new Set(beatIds)
    item.beats = beatIds.map((b) => data.beats[b])
    for (const b of beatIds) refs.add(b)
    const beats = { ...next.beats }
    for (const b of beatIds) delete beats[b]
    for (const b of Object.values(beats)) {
      if (b.until && gone.has(b.until)) {
        item.untils[b.id] = b.until
        const { until: _, ...rest } = b
        beats[b.id] = rest
      }
    }
    const without = (list: string[]) => list.filter((b) => !gone.has(b))
    next = {
      ...next,
      beats,
      arcs: next.arcs.map((a) => {
        let arc = a
        if (a.beatIds.some((b) => gone.has(b))) {
          noted(item, `arc-beats:${a.id}`, a.beatIds)
          arc = { ...arc, beatIds: without(a.beatIds) }
        }
        const steps = arc.outline?.steps
        if (steps && Object.values(steps).some((b) => gone.has(b))) {
          item.steps[a.id] = Object.fromEntries(Object.entries(steps).filter(([, b]) => gone.has(b)))
          arc = { ...arc, outline: { ...arc.outline!, steps: Object.fromEntries(Object.entries(steps).filter(([, b]) => !gone.has(b))) } }
        }
        return arc
      }),
      chapters: next.chapters.map((c) => {
        if (!c.beatIds.some((b) => gone.has(b))) return c
        noted(item, `chapter-beats:${c.id}`, c.beatIds)
        return { ...c, beatIds: without(c.beatIds) }
      }),
    }
    if (next.timeline.some((b) => gone.has(b))) {
      item.places.timeline = next.timeline
      next = { ...next, timeline: without(next.timeline) }
    }
  }

  // Its cards on the maps, with their lines (and lines from it inside other cards).
  // (Not cards for chapters, arcs and beats also in another draft: they're its cards too.)
  const elsewhere = idsElsewhere(data)
  for (const ref of refs) if (elsewhere.has(ref)) refs.delete(ref)
  const anchored = (anchor?: string) => {
    const at = anchor ? anchorItemId(anchor) : null
    return !!at && refs.has(at)
  }
  next = {
    ...next,
    mindMaps: next.mindMaps.map((m) => {
      const nodes = m.nodes.filter((n) => 'refId' in n && refs.has(n.refId))
      const goneNodes = new Set(nodes.map((n) => n.id))
      const edges = m.edges.filter(
        (e) => goneNodes.has(e.source) || goneNodes.has(e.target) || anchored(e.sourceAnchor) || anchored(e.targetAnchor),
      )
      if (!nodes.length && !edges.length) return m
      const goneEdges = new Set(edges.map((e) => e.id))
      item.cards.push({ mapId: m.id, nodes, edges })
      item.places[`map:${m.id}`] = m.nodes.map((n) => n.id)
      item.places[`map-lines:${m.id}`] = m.edges.map((e) => e.id)
      return { ...m, nodes: m.nodes.filter((n) => !goneNodes.has(n.id)), edges: m.edges.filter((e) => !goneEdges.has(e.id)) }
    }),
  }
  return [next, item]
}

/**
 * `adding` put into `list` where they were in `was`: after the nearest one
 * before them there that's still in the list (or before the nearest after).
 */
export function reinsert(list: string[], adding: string[], was: string[]): string[] {
  const out = list.filter((id) => !adding.includes(id))
  const at = (id: string) => {
    const i = was.indexOf(id)
    return i < 0 ? Infinity : i
  }
  for (const id of [...adding].sort((a, b) => at(a) - at(b))) {
    const i = was.indexOf(id)
    let to = out.length
    if (i >= 0) {
      let found = false
      for (let j = i - 1; j >= 0 && !found; j--) {
        const k = out.indexOf(was[j])
        if (k >= 0) [to, found] = [k + 1, true]
      }
      for (let j = i + 1; j < was.length && !found; j++) {
        const k = out.indexOf(was[j])
        if (k >= 0) [to, found] = [k, true]
      }
    }
    out.splice(to, 0, id)
  }
  return out
}

/** Things with ids put back into a list where they were. */
function backInto<T extends { id: string }>(list: T[], adding: T[], was: string[] | undefined): T[] {
  if (!adding.length) return list
  const fresh = adding.filter((x) => !list.some((y) => y.id === x.id))
  if (!fresh.length) return list
  const byId = new Map([...list, ...fresh].map((x) => [x.id, x]))
  return reinsert(
    list.map((x) => x.id),
    fresh.map((x) => x.id),
    was ?? [],
  ).map((id) => byId.get(id)!)
}

/** An archived item put back into the story where it was. */
function putBack(data: StoryData, item: ArchivedItem): StoryData {
  const { places } = item
  const restored = new Set(item.beats.map((b) => b.id))
  const beats: Record<string, Beat> = { ...data.beats }
  for (const b of item.beats) beats[b.id] = b
  // A chapter brought back takes back beats put in it before that are in no chapter now.
  for (const c of item.chapters) {
    for (const b of c.beatIds) if (beats[b] && !beats[b].chapterId && !restored.has(b)) beats[b] = { ...beats[b], chapterId: c.id }
  }
  for (const [b, until] of Object.entries(item.untils)) {
    if (beats[b] && !beats[b].until && beats[until]) beats[b] = { ...beats[b], until }
  }
  const placed = new Map<string, string[]>()
  for (const b of Object.values(beats)) if (b.chapterId) placed.set(b.chapterId, [...(placed.get(b.chapterId) ?? []), b.id])
  const inChapter = (c: Chapter) => (placed.get(c.id) ?? []).filter((b) => !c.beatIds.includes(b))
  const inArc = (a: Arc) => [...restored].filter((b) => beats[b].arcId === a.id && !a.beatIds.includes(b))
  const castBack = item.kind === 'character' ? item.id : null

  const arcs = backInto(data.arcs, item.arcs, places.arcs).map((a) => {
    let arc = a
    const own = inArc(a)
    if (own.length) arc = { ...arc, beatIds: reinsert(a.beatIds, own, places[`arc-beats:${a.id}`] ?? []) }
    const cast = places[`arc-cast:${a.id}`]
    if (castBack && cast && !arc.characterIds.includes(castBack)) arc = { ...arc, characterIds: reinsert(arc.characterIds, [castBack], cast) }
    const steps = item.steps[a.id]
    if (steps && arc.outline) {
      const free = Object.entries(steps).filter(([step, b]) => !(step in arc.outline!.steps) && beats[b]?.arcId === a.id)
      if (free.length) arc = { ...arc, outline: { ...arc.outline, steps: { ...arc.outline.steps, ...Object.fromEntries(free) } } }
    }
    return arc
  })
  const chapters = backInto(data.chapters, item.chapters, places.chapters).map((c) => {
    let chapter = c
    const own = inChapter(c)
    if (own.length) chapter = { ...chapter, beatIds: reinsert(c.beatIds, own, places[`chapter-beats:${c.id}`] ?? item.chapters.find((x) => x.id === c.id)?.beatIds ?? []) }
    if (castBack && item.povs.includes(c.id) && !c.povCharacterId) chapter = { ...chapter, povCharacterId: castBack }
    return chapter
  })
  let timeline = data.timeline
  const inTime = [...restored].filter((b) => places.timeline?.includes(b) && !timeline.includes(b))
  // (A timeline not arranged now stays so: beats slot in by reading order.)
  if (timeline.length && inTime.length) timeline = reinsert(timeline, inTime, places.timeline)

  const standIn = places.standIn?.[0]
  const maps = item.mindMaps.length && standIn ? data.mindMaps.filter((m) => m.id !== standIn || m.nodes.length || m.name !== defaultMindMap().name) : data.mindMaps
  const mindMaps = backInto(maps, item.mindMaps, places.mindMaps).map((m) => {
    const cards = item.cards.filter((c) => c.mapId === m.id)
    if (!cards.length) return m
    const boxes = new Set(m.nodes.filter(isContainer).map((n) => n.id))
    // (On a container that's gone: on the map.)
    const adding = cards.flatMap((c) => c.nodes).map((n) => {
      if (!n.containerId || boxes.has(n.containerId)) return n
      const { containerId: _, ...rest } = n
      return rest as MapNode
    })
    const nodes = backInto(m.nodes, adding, places[`map:${m.id}`])
    const ids = new Set(nodes.map((n) => n.id))
    const lines = cards.flatMap((c) => c.edges).filter((e) => ids.has(e.source) && ids.has(e.target))
    const edges = backInto<MapEdge>(m.edges, lines, places[`map-lines:${m.id}`])
    return nodes === m.nodes && edges === m.edges ? m : { ...m, nodes, edges }
  })

  return {
    ...data,
    chapters,
    arcs,
    beats,
    characters: backInto(data.characters, item.characters, places.characters),
    elements: backInto(data.elements, item.elements, places.elements),
    texts: Object.keys(item.texts).length ? { ...data.texts, ...item.texts } : data.texts,
    timeline,
    mindMaps,
  }
}

/** Archives a thing (with what goes with it). */
export function archiveItem(data: StoryData, kind: ArchiveKind, id: string, at: number = Date.now()): StoryData {
  const taken = takeOut(data, kind, id, at)
  return taken ? { ...taken[0], archive: [...data.archive, taken[1]] } : data
}

/**
 * Makes a change with everything archived back in the story (so it's made
 * to what's archived too: a character deleted is unmentioned in archived
 * chapters as well), then archives again what still exists, as it was.
 * `keep`: archived items not to archive again (brought back).
 */
export function throughArchive(data: StoryData, change: (all: StoryData) => StoryData, keep: Set<ArchivedItem> = new Set()): StoryData {
  // (What's archived from other drafts stays as it is: it's theirs.)
  const here = data.archive.filter(inOpenDraft(data))
  if (!here.length) return change(data)
  let all: StoryData = { ...data, archive: [] }
  for (let i = here.length - 1; i >= 0; i--) all = putBack(all, here[i])
  let next = change(normalizeStory(all))
  const again = new Map<ArchivedItem, ArchivedItem>()
  for (const item of here) {
    if (keep.has(item)) continue
    const beats = item.kind === 'chapter' ? new Set(item.beats.map((b) => b.id)) : undefined
    const taken = takeOut(next, item.kind, item.id, item.at, beats)
    if (!taken) continue
    next = taken[0]
    again.set(item, taken[1])
  }
  const mine = new Set(here)
  const archive = data.archive.flatMap((a) => (!mine.has(a) ? [a] : again.has(a) ? [again.get(a)!] : []))
  return keepUnchanged(data, { ...next, archive })
}

/**
 * Brings an archived thing back where it was. A beat whose arc is archived
 * brings its arc back too (a beat is always on an arc); a beat whose chapter
 * is archived comes back in no chapter.
 */
export function restoreArchived(data: StoryData, id: string): StoryData {
  const here = data.archive.filter(inOpenDraft(data))
  const item = here.find((a) => a.id === id)
  if (!item) return data
  const keep = new Set([item])
  if (item.kind === 'beat') {
    const arcId = item.beats[0]?.arcId
    const arc = here.find((a) => a.kind === 'arc' && a.arcs.some((r) => r.id === arcId))
    if (arc) keep.add(arc)
  }
  return throughArchive(data, (all) => all, keep)
}

/**
 * Deletes an archived thing for good, as deleting it does (a chapter's
 * beats, archived with it, go too).
 */
export function deleteArchived(
  data: StoryData,
  id: string,
  ops: {
    deleteChapter: (d: StoryData, id: string) => StoryData
    deleteArc: (d: StoryData, id: string) => StoryData
    deleteBeat: (d: StoryData, id: string) => StoryData
    deleteCharacter: (d: StoryData, id: string) => StoryData
    deleteElement: (d: StoryData, id: string) => StoryData
    deleteMindMap: (d: StoryData, id: string) => StoryData
  },
): StoryData {
  const item = data.archive.filter(inOpenDraft(data)).find((a) => a.id === id)
  if (!item || !mainOf(item)) return data
  return throughArchive(
    data,
    (all) => {
      switch (item.kind) {
        case 'chapter':
          return ops.deleteChapter(
            item.beats.reduce((d, b) => ops.deleteBeat(d, b.id), all),
            id,
          )
        case 'arc':
          return ops.deleteArc(all, id)
        case 'beat':
          return ops.deleteBeat(all, id)
        case 'character':
          return ops.deleteCharacter(all, id)
        case 'element':
          return ops.deleteElement(all, id)
        case 'map':
          return ops.deleteMindMap(all, id)
      }
    },
    new Set([item]),
  )
}

// ---------- Keeping what didn't change ----------

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

function keepList<T extends { id: string }>(was: T[], now: T[]): T[] {
  const byId = new Map(was.map((x) => [x.id, x]))
  const out = now.map((x) => {
    const old = byId.get(x.id)
    return old && same(old, x) ? old : x
  })
  return out.length === was.length && out.every((x, i) => x === was[i]) ? was : out
}

function keepRecord<T>(was: Record<string, T>, now: Record<string, T>, equal: (a: T, b: T) => boolean = same): Record<string, T> {
  const out: Record<string, T> = {}
  let changed = Object.keys(was).length !== Object.keys(now).length
  for (const [id, x] of Object.entries(now)) {
    const old = was[id]
    if (old !== undefined && equal(old, x)) out[id] = old
    else {
      out[id] = x
      changed = true
    }
  }
  return changed ? out : was
}

/**
 * The story after a change through the archive (which builds every part of
 * it anew), with each part that's as it was kept as it was: so only what
 * changed looks changed.
 */
function keepUnchanged(was: StoryData, now: StoryData): StoryData {
  return {
    ...was,
    chapters: keepList(was.chapters, now.chapters),
    arcs: keepList(was.arcs, now.arcs),
    characters: keepList(was.characters, now.characters),
    elements: keepList(was.elements, now.elements),
    mindMaps: keepList(was.mindMaps, now.mindMaps),
    beats: keepRecord(was.beats, now.beats),
    texts: keepRecord(was.texts, now.texts, (a, b) => a.doc === b.doc && a.words === b.words && a.updatedAt === b.updatedAt),
    timeline: same(was.timeline, now.timeline) ? was.timeline : now.timeline,
    archive: now.archive.length === was.archive.length && now.archive.every((a, i) => same(a, was.archive[i])) ? was.archive : now.archive,
  }
}

// ---------- Saves from before ----------

/**
 * A story as saved, made right (see normalizeStory). Chapters shelved
 * before drafts and archiving replaced chapter status are archived.
 */
export function upgradeStory(input: unknown, at: number = Date.now()): StoryData {
  const data = normalizeStory(input)
  const raw = typeof input === 'object' && input !== null ? (input as { chapters?: unknown }) : {}
  const shelved = (Array.isArray(raw.chapters) ? raw.chapters : []).flatMap((c) =>
    typeof c === 'object' && c !== null && (c as { status?: unknown }).status === 'shelved' && typeof (c as { id?: unknown }).id === 'string'
      ? [(c as { id: string }).id]
      : [],
  )
  return shelved.reduce((d, id) => archiveItem(d, 'chapter', id, at), data)
}
