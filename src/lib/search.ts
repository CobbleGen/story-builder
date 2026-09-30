import type { RichNode, StoryData } from '../types'
import { displayName, plainText, type Lookup } from './mentions'
import { MENTION_NODE } from './richText'

// Search over the whole story: chapters, the manuscript, beats, arcs,
// characters, places and things, and mind maps. Text is searched as it reads
// (mentions by name), ignoring case and accents. Every word of the query has
// to be found; "quoted words" are found together.

export type HitKind = 'chapter' | 'beat' | 'character' | 'element' | 'arc' | 'text' | 'note' | 'map'

/** Some text, with the stretches that matched the query. */
export interface Marked {
  text: string
  marks: [number, number][]
}

export interface Hit {
  kind: HitKind
  /** Unique among all hits. */
  key: string
  /** The item: a chapter, beat, arc, character, element, map card or map. */
  id: string
  title: Marked
  /** More of the match, when it isn't all in the title. */
  snippet?: Marked
  /** What the snippet is (an attribute's label, say). */
  snippetLabel?: string
  /** Manuscript hits: which of the chapter's paragraphs and headings, counted from 0. */
  block?: number
  /** Mind map hits: the map. */
  mapId?: string
}

export interface HitGroup {
  kind: HitKind
  label: string
  hits: Hit[]
}

/** What the manuscript finds and selects when a search result opens it. */
export interface TextFind {
  /** Which paragraph or heading (see textBlocks). */
  block: number
  /** The folded query words; the first one found there is selected. */
  terms: string[]
}

export const GROUP_LABELS: Record<HitKind, string> = {
  chapter: 'Chapters',
  beat: 'Beats',
  character: 'Characters',
  element: 'Places & things',
  arc: 'Arcs',
  text: 'Manuscript',
  note: 'Mind map notes',
  map: 'Mind maps',
}

const GROUP_ORDER: HitKind[] = ['chapter', 'beat', 'character', 'element', 'arc', 'text', 'note', 'map']

/** The most manuscript paragraphs listed; past this the list stops growing. */
export const MAX_TEXT_HITS = 300

// ---------- Folding: lower case, no accents, same length ----------

const MARKS = /\p{M}/gu

function foldChar(ch: string): string {
  const plain = ch.normalize('NFD').replace(MARKS, '').toLowerCase()
  if (plain.length === ch.length) return plain
  const lower = ch.toLowerCase()
  return lower.length === ch.length ? lower : ch
}

/**
 * Text lower-cased and without accents, character for character, so a match
 * found in the folded text is at the same place in the original.
 */
export function fold(text: string): string {
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7f]/.test(text)) return text.toLowerCase()
  let out = ''
  for (const ch of text) out += ch < '\x80' ? ch.toLowerCase() : foldChar(ch)
  return out
}

/** The words of a query, folded; "quoted words" stay together. */
export function parseQuery(query: string): string[] {
  const terms: string[] = []
  for (const m of query.matchAll(/"([^"]+)"|(\S+)/g)) {
    const term = fold((m[1] ?? m[2]).trim().replace(/\s+/g, ' '))
    if (term && !terms.includes(term)) terms.push(term)
  }
  // A word inside a longer one ("the" and "theo") adds nothing.
  return terms.filter((t) => !terms.some((other) => other !== t && other.includes(t)))
}

// ---------- The index ----------

interface Field {
  text: string
  folded: string
  /** Shown before a snippet from this field ("Age"). */
  label?: string
}

interface Entry {
  kind: HitKind
  id: string
  key: string
  /** Matched against, and shown. */
  title: Field
  /** Also matched against; shown as the snippet. */
  fields: Field[]
  /** Manuscript entries only match their text, not the chapter title shown with them. */
  titleIsLabel?: boolean
  block?: number
  mapId?: string
}

export type SearchIndex = Entry[]

const field = (text: string, label?: string): Field => {
  // Line breaks read as spaces in results.
  const flat = text.replace(/[\n\r\t]/g, ' ')
  return { text: flat, folded: fold(flat), ...(label ? { label } : {}) }
}

const TEXTBLOCKS = new Set(['paragraph', 'heading', 'codeBlock'])

/** A text block's text as it reads: mentions by name, line breaks as spaces. */
function blockText(node: RichNode, nameOf: (id: string, label: unknown) => string): string {
  let out = ''
  for (const child of node.content ?? []) {
    if (child.type === 'text') out += child.text ?? ''
    else if (child.type === MENTION_NODE) out += nameOf(String(child.attrs?.id ?? ''), child.attrs?.label)
    else if (child.content) out += blockText(child, nameOf)
    else out += ' '
  }
  return out
}

/** A chapter's paragraphs and headings, in order, as they read. */
export function textBlocks(doc: RichNode, lookup: Lookup): string[] {
  const nameOf = (id: string, label: unknown) => {
    const named = lookup.get(id)
    return named ? displayName(named) : String(label ?? 'unknown')
  }
  const blocks: string[] = []
  const walk = (node: RichNode) => {
    if (TEXTBLOCKS.has(node.type)) {
      blocks.push(blockText(node, nameOf))
      return
    }
    for (const child of node.content ?? []) walk(child)
  }
  walk(doc)
  return blocks
}

type Searchable = Pick<StoryData, 'chapters' | 'texts' | 'beats' | 'arcs' | 'characters' | 'elements' | 'mindMaps'>

/** Everything searchable in the story, worked out once and searched as the query changes. */
export function buildIndex(data: Searchable, lookup: Lookup): SearchIndex {
  const plain = (stored: string) => plainText(stored, lookup)
  const entries: Entry[] = []

  data.chapters.forEach((c, i) => {
    entries.push({ kind: 'chapter', id: c.id, key: `chapter:${c.id}`, title: field(plain(c.title)), fields: [field(plain(c.summary))] })
    const text = data.texts[c.id]
    if (!text) return
    const label = field(`Chapter ${i + 1}${c.title ? `: ${plain(c.title)}` : ''}`)
    textBlocks(text.doc, lookup).forEach((block, b) => {
      if (!block.trim()) return
      entries.push({ kind: 'text', id: c.id, key: `text:${c.id}:${b}`, title: label, fields: [field(block)], titleIsLabel: true, block: b })
    })
  })

  // Beats in story order: those in chapters by chapter, then the rest by arc.
  const beatIds = [
    ...data.chapters.flatMap((c) => c.beatIds),
    ...data.arcs.flatMap((a) => a.beatIds.filter((b) => !data.beats[b]?.chapterId)),
  ]
  for (const id of beatIds) {
    const b = data.beats[id]
    if (!b) continue
    entries.push({ kind: 'beat', id, key: `beat:${id}`, title: field(plain(b.title)), fields: [field(plain(b.description))] })
  }

  for (const c of data.characters) {
    entries.push({
      kind: 'character',
      id: c.id,
      key: `character:${c.id}`,
      title: field(displayName(c)),
      fields: [field(plain(c.description)), ...c.attributes.map((a) => field(plain(a.value), a.label || 'Note'))],
    })
  }
  for (const e of data.elements) {
    entries.push({
      kind: 'element',
      id: e.id,
      key: `element:${e.id}`,
      title: field(displayName(e)),
      fields: [field(plain(e.description)), ...e.attributes.map((a) => field(plain(a.value), a.label || 'Note'))],
    })
  }
  for (const a of data.arcs) {
    entries.push({ kind: 'arc', id: a.id, key: `arc:${a.id}`, title: field(plain(a.name)), fields: [field(plain(a.description))] })
  }
  for (const map of data.mindMaps) {
    entries.push({ kind: 'map', id: map.id, key: `map:${map.id}`, title: field(map.name), fields: [], mapId: map.id })
    for (const n of map.nodes) {
      if (n.kind !== 'note' && n.kind !== 'text') continue
      entries.push({
        kind: 'note',
        id: n.id,
        key: `note:${n.id}`,
        title: field(map.name),
        fields: [field(plain(n.text))],
        titleIsLabel: true,
        mapId: map.id,
      })
    }
  }
  return entries
}

// ---------- Searching ----------

/** Where the terms are in some folded text, merged where they overlap. */
function marksIn(folded: string, terms: string[]): [number, number][] {
  const found: [number, number][] = []
  for (const term of terms) {
    for (let i = folded.indexOf(term); i !== -1; i = folded.indexOf(term, i + term.length)) {
      found.push([i, i + term.length])
    }
  }
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: [number, number][] = []
  for (const [s, e] of found) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }
  return merged
}

const SNIPPET = 150
const LEAD = 48

/** A stretch of a long text around its first match, with the matches marked. */
export function snippetOf(f: Field, terms: string[]): Marked {
  const all = marksIn(f.folded, terms)
  if (f.text.length <= SNIPPET) return { text: f.text, marks: all }
  const first = all[0]?.[0] ?? 0
  let start = Math.max(0, first - LEAD)
  // Start and end at word breaks where there are some nearby.
  if (start > 0) {
    const space = f.text.indexOf(' ', start)
    if (space !== -1 && space < first) start = space + 1
  }
  let end = Math.min(f.text.length, start + SNIPPET)
  if (end < f.text.length) {
    const space = f.text.lastIndexOf(' ', end)
    if (space > Math.max(start, all[0]?.[1] ?? start)) end = space
  }
  const lead = start > 0 ? '…' : ''
  const text = `${lead}${f.text.slice(start, end).trim()}${end < f.text.length ? '…' : ''}`
  const trimmed = f.text.slice(start, end).length - f.text.slice(start, end).trimStart().length
  const shift = lead.length - start - trimmed
  const marks = all
    .filter(([s, e]) => s >= start + trimmed && e <= end)
    .map(([s, e]): [number, number] => [s + shift, e + shift])
  return { text, marks }
}

/**
 * Every entry that has all the terms, grouped by kind, title matches first.
 * A group whose best match is a closer one comes first (a place named just
 * what was typed before beats that mention it); otherwise groups keep their
 * usual order.
 */
export function search(index: SearchIndex, query: string): HitGroup[] {
  const terms = parseQuery(query)
  if (!terms.length) return []
  const phrase = fold(query.replace(/"/g, '').trim().replace(/\s+/g, ' '))
  const groups = new Map<HitKind, { hit: Hit; score: number; order: number }[]>()
  let textHits = 0
  index.forEach((entry, order) => {
    if (entry.kind === 'text' && textHits >= MAX_TEXT_HITS) return
    const searched = entry.titleIsLabel ? entry.fields : [entry.title, ...entry.fields]
    if (!terms.every((t) => searched.some((f) => f.folded.includes(t)))) return
    if (entry.kind === 'text') textHits++
    const inTitle = !entry.titleIsLabel && terms.every((t) => entry.title.folded.includes(t))
    const hit: Hit = {
      kind: entry.kind,
      key: entry.key,
      id: entry.id,
      title: { text: entry.title.text, marks: entry.titleIsLabel ? [] : marksIn(entry.title.folded, terms) },
      ...(entry.block !== undefined ? { block: entry.block } : {}),
      ...(entry.mapId ? { mapId: entry.mapId } : {}),
    }
    if (!inTitle) {
      // The field with the most of the terms makes the snippet.
      let best: Field | undefined
      let bestCount = 0
      for (const f of entry.fields) {
        const count = terms.filter((t) => f.folded.includes(t)).length
        if (count > bestCount) {
          best = f
          bestCount = count
        }
      }
      if (best) {
        hit.snippet = snippetOf(best, terms)
        if (best.label) hit.snippetLabel = best.label
      }
    }
    const score = entry.titleIsLabel ? 0 : entry.title.folded === phrase ? 3 : entry.title.folded.includes(phrase) ? 2 : inTitle ? 1 : 0
    const list = groups.get(entry.kind) ?? []
    list.push({ hit, score, order })
    groups.set(entry.kind, list)
  })
  const best = (kind: HitKind) => Math.max(...groups.get(kind)!.map((h) => h.score))
  return GROUP_ORDER.filter((kind) => groups.has(kind))
    .sort((a, b) => best(b) - best(a) || GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b))
    .map((kind) => ({
      kind,
      label: GROUP_LABELS[kind],
      hits: groups
        .get(kind)!
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map((h) => h.hit),
    }))
}
