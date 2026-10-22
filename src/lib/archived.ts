import type { ArchiveKind, ArchivedItem, Beat, Chapter, ChapterText, MapEdge, MapNode, StoryData } from '../types'
import { displayName, plainText, type Lookup, type Mentionable } from './mentions'
import { isDoc } from './richText'
import { outlineWords } from './progress'

// What's archived, read: names for the Archived list, mentions of archived
// characters and places still shown by name, and old or hand-edited saves
// made safe to read. (Archiving and bringing back are in store/archive.)

export const ARCHIVE_KINDS: ArchiveKind[] = ['chapter', 'arc', 'beat', 'character', 'element', 'map']

export const ARCHIVE_NOUNS: Record<ArchiveKind, string> = {
  chapter: 'chapter',
  arc: 'arc',
  beat: 'beat',
  character: 'character',
  element: 'item',
  map: 'map',
}

/** The archived item an id belongs to (the thing itself, or something that went with it, like a chapter's beats). */
export function archivedWith(data: Pick<StoryData, 'archive'>, id: string): ArchivedItem | undefined {
  return data.archive.find(
    (a) =>
      a.id === id ||
      a.beats.some((b) => b.id === id) ||
      a.chapters.some((c) => c.id === id) ||
      a.arcs.some((r) => r.id === id),
  )
}

/** Characters and elements archived: their mentions in the story still read as their names. */
export function archivedNamed(data: Pick<StoryData, 'archive'>): Mentionable[] {
  return data.archive.flatMap((a) => [...a.characters, ...a.elements])
}

/** Every beat id in the archive (a link to one in the text stays). */
export function archivedBeatIds(data: Pick<StoryData, 'archive'>): string[] {
  return data.archive.flatMap((a) => a.beats.map((b) => b.id))
}

/** The archived text of a chapter, if it's archived. */
export function archivedText(data: Pick<StoryData, 'archive'>, chapterId: string): ChapterText | undefined {
  for (const a of data.archive) if (a.texts[chapterId]) return a.texts[chapterId]
  return undefined
}

/** Words in the outline that's archived (beats, arcs, chapter titles and summaries), so archiving isn't counted as cutting. */
export function archivedOutlineWords(data: Pick<StoryData, 'archive'>): number {
  let n = 0
  for (const a of data.archive) {
    if (!a.beats.length && !a.arcs.length && !a.chapters.length) continue
    n += outlineWords({ beats: Object.fromEntries(a.beats.map((b) => [b.id, b])), arcs: a.arcs, chapters: a.chapters }).total
  }
  return n
}

/** The archived thing itself. */
export function mainOf(item: ArchivedItem) {
  switch (item.kind) {
    case 'chapter':
      return item.chapters.find((c) => c.id === item.id)
    case 'arc':
      return item.arcs.find((a) => a.id === item.id)
    case 'beat':
      return item.beats.find((b) => b.id === item.id)
    case 'character':
      return item.characters.find((c) => c.id === item.id)
    case 'element':
      return item.elements.find((e) => e.id === item.id)
    case 'map':
      return item.mindMaps.find((m) => m.id === item.id)
  }
}

/** What an archived thing is called: its name, as the writer sees it. */
export function archivedName(item: ArchivedItem, lookup: Lookup): string {
  switch (item.kind) {
    case 'chapter':
      return plainText(item.chapters[0]?.title ?? '', lookup).trim() || 'Untitled chapter'
    case 'arc':
      return plainText(item.arcs[0]?.name ?? '', lookup).trim() || 'Untitled arc'
    case 'beat':
      return plainText(item.beats[0]?.title ?? '', lookup).trim() || 'Untitled beat'
    case 'character':
      return item.characters[0] ? displayName(item.characters[0]) : 'Character'
    case 'element':
      return item.elements[0] ? displayName(item.elements[0]) : 'Item'
    case 'map':
      return item.mindMaps[0]?.name || 'Untitled map'
  }
}

// ---------- Reading a save ----------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)
const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])
const list = (value: unknown) => (Array.isArray(value) ? value : []).filter(isRecord).filter((r) => typeof r.id === 'string' && r.id)
const stringMap = (value: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(isRecord(value) ? value : {}).filter((e): e is [string, string] => typeof e[1] === 'string'))

const attributes = (value: unknown) =>
  list(value).map((a) => ({ id: str(a.id), label: str(a.label), value: str(a.value) }))

/**
 * The archive of a save, safe to read: anything that isn't what it should
 * be is left out. (What's in it is checked again in full when it's brought
 * back, as part of the story.)
 */
export function archiveOf(value: unknown): ArchivedItem[] {
  const out: ArchivedItem[] = []
  const seen = new Set<string>()
  for (const raw of Array.isArray(value) ? value.filter(isRecord) : []) {
    const kind = raw.kind as ArchiveKind
    const id = str(raw.id)
    if (!ARCHIVE_KINDS.includes(kind) || !id || seen.has(id)) continue
    const texts: Record<string, ChapterText> = {}
    for (const [chapterId, t] of Object.entries(isRecord(raw.texts) ? raw.texts : {})) {
      if (!isRecord(t) || !isDoc(t.doc)) continue
      texts[chapterId] = { doc: t.doc, words: typeof t.words === 'number' ? t.words : 0, updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : 0 }
    }
    const item: ArchivedItem = {
      kind,
      id,
      at: typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0,
      chapters: list(raw.chapters).map(
        (c) =>
          ({
            ...c,
            title: str(c.title),
            summary: str(c.summary),
            beatIds: ids(c.beatIds),
            povCharacterId: typeof c.povCharacterId === 'string' ? c.povCharacterId : null,
            status: str(c.status, 'outline'),
          }) as Chapter,
      ),
      arcs: list(raw.arcs).map((a) => ({
        ...a,
        id: str(a.id),
        name: str(a.name),
        color: str(a.color, '#6f7480'),
        description: str(a.description),
        beatIds: ids(a.beatIds),
        characterIds: ids(a.characterIds),
        ...(isRecord(a.outline) ? { outline: { kind: str(a.outline.kind), steps: stringMap(a.outline.steps) } } : {}),
      })),
      beats: list(raw.beats)
        .filter((b) => typeof b.arcId === 'string')
        .map(
          (b) =>
            ({
              ...b,
              title: str(b.title),
              description: str(b.description),
              chapterId: typeof b.chapterId === 'string' ? b.chapterId : null,
              done: b.done === true,
            }) as Beat,
        ),
      characters: list(raw.characters).map((c) => ({
        ...c,
        id: str(c.id),
        name: str(c.name),
        color: str(c.color, '#6f7480'),
        description: str(c.description),
        attributes: attributes(c.attributes),
      })),
      elements: list(raw.elements)
        .filter((e) => str(e.id).startsWith('elm_'))
        .map((e) => ({
          ...e,
          id: str(e.id),
          kind: ['place', 'object', 'group', 'other'].includes(str(e.kind)) ? (e.kind as 'place') : 'other',
          name: str(e.name),
          color: str(e.color, '#6f7480'),
          description: str(e.description),
          attributes: attributes(e.attributes),
        })),
      mindMaps: list(raw.mindMaps).map((m) => ({
        id: str(m.id),
        name: str(m.name, 'Untitled map'),
        nodes: list(m.nodes) as unknown as MapNode[],
        edges: list(m.edges).filter((e) => typeof e.source === 'string' && typeof e.target === 'string') as unknown as MapEdge[],
      })),
      texts,
      places: Object.fromEntries(Object.entries(isRecord(raw.places) ? raw.places : {}).map(([key, v]) => [key, ids(v)])),
      povs: ids(raw.povs),
      untils: stringMap(raw.untils),
      steps: Object.fromEntries(Object.entries(isRecord(raw.steps) ? raw.steps : {}).map(([arcId, v]) => [arcId, stringMap(v)])),
      cards: (Array.isArray(raw.cards) ? raw.cards : []).filter(isRecord).map((c) => ({
        mapId: str(c.mapId),
        nodes: list(c.nodes) as unknown as MapNode[],
        edges: list(c.edges).filter((e) => typeof e.source === 'string' && typeof e.target === 'string') as unknown as MapEdge[],
      })),
    }
    if (!mainOf(item)) continue
    seen.add(id)
    out.push(item)
  }
  return out
}
