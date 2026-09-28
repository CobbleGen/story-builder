import type { Character } from '../types'

// Character mentions are stored in text as `@{<characterId>}` so renaming a
// character updates every mention. Editors show them as `@Name`.

const TOKEN_RE = /@\{(chr_[A-Za-z0-9_]+)\}/g
const WORD_RE = /[\p{L}\p{N}_]/u

export const mentionToken = (id: string) => `@{${id}}`

/** The name a character is shown (and typed) by. */
export const displayName = (c: Pick<Character, 'name'>) => c.name.trim() || 'Unnamed character'

type Lookup = Map<string, Pick<Character, 'id' | 'name' | 'color'>>

export function lookupOf(characters: Pick<Character, 'id' | 'name' | 'color'>[]): Lookup {
  return new Map(characters.map((c) => [c.id, c]))
}

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; id: string; text: string; color: string | null; known: boolean }

/** Splits stored text into plain runs and mentions (shown as `@Name`). */
export function parseMentions(stored: string, lookup: Lookup): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of stored.matchAll(TOKEN_RE)) {
    if (m.index > last) out.push({ kind: 'text', text: stored.slice(last, m.index) })
    const c = lookup.get(m[1])
    out.push({
      kind: 'mention',
      id: m[1],
      text: `@${c ? displayName(c) : 'unknown'}`,
      color: c?.color ?? null,
      known: !!c,
    })
    last = m.index + m[0].length
  }
  if (last < stored.length) out.push({ kind: 'text', text: stored.slice(last) })
  return out
}

/** Stored text as the user edits it: every mention becomes `@Name`. */
export function toDisplay(stored: string, lookup: Lookup): string {
  return parseMentions(stored, lookup)
    .map((s) => s.text)
    .join('')
}

/** Stored text as it reads in plain contexts (tooltips, menus): mentions become `Name`. */
export function plainText(stored: string, lookup: Lookup): string {
  return parseMentions(stored, lookup)
    .map((s) => (s.kind === 'mention' ? s.text.slice(1) : s.text))
    .join('')
}

/**
 * Turns edited text back into stored text: `@Name` becomes a mention when it
 * names a character exactly (longest name wins) and isn't part of a longer
 * word. `toDisplay(toStored(x)) === x` for any typed x, so editing is stable.
 */
export function toStored(display: string, characters: Pick<Character, 'id' | 'name'>[]): string {
  if (!display.includes('@') || characters.length === 0) return display
  const names = characters
    .map((c) => ({ id: c.id, name: displayName(c) }))
    .sort((a, b) => b.name.length - a.name.length)
  let out = ''
  let i = 0
  while (i < display.length) {
    const at = display.indexOf('@', i)
    if (at === -1) {
      out += display.slice(i)
      break
    }
    out += display.slice(i, at)
    const before = at > 0 ? display[at - 1] : ''
    let match: { id: string; name: string } | undefined
    if (!before || !WORD_RE.test(before)) {
      match = names.find((n) => {
        if (!display.startsWith(n.name, at + 1)) return false
        const after = display[at + 1 + n.name.length]
        return !after || !WORD_RE.test(after)
      })
    }
    if (match) {
      out += mentionToken(match.id)
      i = at + 1 + match.name.length
    } else {
      out += '@'
      i = at + 1
    }
  }
  return out
}

export function mentions(stored: string, characterId: string): boolean {
  return stored.includes(mentionToken(characterId))
}

/**
 * The `@query` being typed just before the caret, if any: the `@` must start
 * a word and the query can't span lines.
 */
export function activeQuery(text: string, caret: number): { start: number; query: string } | null {
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1
  const at = text.lastIndexOf('@', caret - 1)
  if (at < lineStart || caret - at > 40) return null
  const before = at > 0 ? text[at - 1] : ''
  if (before && WORD_RE.test(before)) return null
  return { start: at, query: text.slice(at + 1, caret) }
}
