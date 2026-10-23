import type { StoryData } from '../types'
import * as ops from '../store/storyOps'
import { displayName, mentionToken, plainText, type Lookup } from '../lib/mentions'
import { docText, findAnchor, type TextAnchor } from './anchor'
import { SUGGEST_FIELDS, type CommentTarget, type CommentThread, type SuggestField } from './model'

// Suggested changes, as an editor or AI assistant makes them and the writer
// accepts or declines them: new words for a passage of the manuscript, or a
// new title, summary, name or description for a chapter, beat, arc,
// character, place or mind map card. Accepting makes the change (one step to
// undo, see ./makeChange); either way the thread is resolved, with a reply
// saying which. (Read by the story server too, so nothing here needs the editor.)

export type NameOf = (id: string, label: unknown) => string

/** The fields a change can be suggested to on this thing (a map card's: its text, or a group's title). */
export function fieldsFor(target: CommentTarget, data: StoryData): { field: SuggestField; label: string }[] {
  if (target.kind !== 'map') return SUGGEST_FIELDS[target.kind] ?? []
  const node = target.node ? data.mindMaps.find((m) => m.id === target.id)?.nodes.find((n) => n.id === target.node) : undefined
  if (node?.kind === 'note' || node?.kind === 'text') return [{ field: 'text', label: 'Text' }]
  if (node?.kind === 'container') return [{ field: 'title', label: 'Title' }]
  return []
}

/** Whether a suggestion can change this field of this thing (one it has, of those a suggestion can change). */
export const canSuggest = (target: CommentTarget, field: SuggestField, data: StoryData) => fieldsFor(target, data).some((f) => f.field === field)

/** A field's value now (mentions as tokens); undefined when the thing isn't in the story (the open draft). */
export function fieldValue(target: CommentTarget, field: SuggestField, data: StoryData): string | undefined {
  const pick = (o: object | undefined) => (o && field in o ? String((o as Record<string, unknown>)[field] ?? '') : o ? '' : undefined)
  switch (target.kind) {
    case 'chapter':
      return pick(data.chapters.find((c) => c.id === target.id))
    case 'beat':
      return pick(data.beats[target.id])
    case 'arc':
      return pick(data.arcs.find((a) => a.id === target.id))
    case 'character':
      return pick(data.characters.find((c) => c.id === target.id))
    case 'element':
      return pick(data.elements.find((e) => e.id === target.id))
    case 'map':
      return pick(data.mindMaps.find((m) => m.id === target.id)?.nodes.find((n) => n.id === target.node))
    default:
      return undefined
  }
}

/** The story with a field changed (as accepting a suggestion does). */
export function withField(data: StoryData, target: CommentTarget, field: SuggestField, value: string): StoryData {
  const patch = { [field]: value }
  switch (target.kind) {
    case 'chapter':
      return ops.updateChapter(data, target.id, patch)
    case 'beat':
      return ops.updateBeat(data, target.id, patch)
    case 'arc':
      return ops.updateArc(data, target.id, patch)
    case 'character':
      return ops.updateCharacter(data, target.id, patch)
    case 'element':
      return ops.updateElement(data, target.id, patch)
    case 'map':
      return target.node ? ops.updateMapNode(data, target.node, patch) : data
    default:
      return data
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Suggested words for a field written as plain text (as an assistant writes
 * them): the names that were mentions in the field before are mentions again.
 */
export function relink(from: string, to: string, lookup: Lookup): string {
  let out = to
  for (const [, id] of from.matchAll(/@\{([^}]+)\}/g)) {
    const named = lookup.get(id)
    if (!named || out.includes(mentionToken(id))) continue
    const name = displayName(named)
    if (!name) continue
    const at = new RegExp(`(?<![\\p{L}\\p{N}@])${escape(name)}(?![\\p{L}\\p{N}])`, 'u')
    out = out.replace(at, mentionToken(id))
  }
  return out
}

/** What a suggestion would do now, in words to show: the words now and suggested, and whether it can be made. */
export interface SuggestionView {
  /** "The words", "Title", "Notes"… */
  what: string
  from: string
  to: string
  /** It can be made as suggested. */
  ready: boolean
  /** Why not, or what to know first. */
  note?: string
}

export function suggestionView(target: CommentTarget, data: StoryData, lookup: Lookup, nameOf: NameOf): SuggestionView | null {
  const s = target.suggest
  if (!s) return null
  if ('text' in s) {
    const anchor = target as TextAnchor & { id: string }
    const text = data.texts[anchor.id]
    const found = text ? findAnchor(docText(text.doc, nameOf), anchor) : null
    const ready = !!found?.exact
    return {
      what: 'The words',
      from: anchor.quote,
      to: s.text,
      ready,
      note: ready ? undefined : found ? 'The words there have changed since: make the change by hand, or decline it.' : 'Those words aren’t in the chapter any more.',
    }
  }
  const now = fieldValue(target, s.field, data)
  const label = (target.kind === 'map' ? fieldsFor(target, data) : (SUGGEST_FIELDS[target.kind] ?? [])).find((f) => f.field === s.field)?.label ?? s.field
  const shown = (v: string) => plainText(v, lookup)
  if (now !== undefined && !canSuggest(target, s.field, data)) return { what: label, from: shown(s.from), to: shown(s.to), ready: false, note: 'That can’t be changed by a suggestion.' }
  if (now === undefined) return { what: label, from: shown(s.from), to: shown(s.to), ready: false, note: 'It isn’t in the story (this draft) any more.' }
  if (now === s.to || shown(now) === shown(s.to)) return { what: label, from: shown(s.from), to: shown(s.to), ready: false, note: 'It already reads like that.' }
  return {
    what: label,
    from: shown(s.from),
    to: shown(s.to),
    ready: true,
    note: now !== s.from && shown(now) !== shown(s.from) ? 'It’s been changed since: accepting puts the suggested words in place of what’s there now.' : undefined,
  }
}

/** Whether a thread is a suggested change. */
export const isSuggestion = (t: CommentThread) => !!t.target.suggest
