import type { Character } from '../types'

// Character mentions are stored in text as `@{<characterId>}`, so renaming a
// character updates every mention. They're shown as the character's name
// alone, in the character's color; `@` is only typed to start one.

const TOKEN_RE = /@\{(chr_[A-Za-z0-9_]+)\}/g
const WORD_RE = /[\p{L}\p{N}_]/u
const isWordChar = (ch: string | undefined) => !!ch && WORD_RE.test(ch)

export const mentionToken = (id: string) => `@{${id}}`

/** The name a character is shown (and typed) by. */
export const displayName = (c: Pick<Character, 'name'>) => c.name.trim() || 'Unnamed character'

type Named = Pick<Character, 'id' | 'name'>
type Lookup = Map<string, Pick<Character, 'id' | 'name' | 'color'>>

export function lookupOf(characters: Pick<Character, 'id' | 'name' | 'color'>[]): Lookup {
  return new Map(characters.map((c) => [c.id, c]))
}

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; id: string; text: string; color: string | null; known: boolean }

/** Splits stored text into plain runs and mentions (whose text is the character's name). */
export function parseMentions(stored: string, lookup: Lookup): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of stored.matchAll(TOKEN_RE)) {
    if (m.index > last) out.push({ kind: 'text', text: stored.slice(last, m.index) })
    const c = lookup.get(m[1])
    out.push({
      kind: 'mention',
      id: m[1],
      text: c ? displayName(c) : 'unknown character',
      color: c?.color ?? null,
      known: !!c,
    })
    last = m.index + m[0].length
  }
  if (last < stored.length) out.push({ kind: 'text', text: stored.slice(last) })
  return out
}

/** Stored text as it reads (and is edited): each mention becomes the character's name. */
export function toDisplay(stored: string, lookup: Lookup): string {
  if (!stored.includes('@{')) return stored
  return parseMentions(stored, lookup)
    .map((s) => s.text)
    .join('')
}

/** Same as toDisplay; for plain contexts such as tooltips and menus. */
export const plainText = toDisplay

export function mentions(stored: string, characterId: string): boolean {
  return stored.includes(mentionToken(characterId))
}

/** Whether a typed query could be (the start of) this character's name. */
export function matchesName(character: Pick<Character, 'name'>, query: string): boolean {
  const name = displayName(character).toLowerCase()
  const q = query.toLowerCase()
  if (/\s/.test(q)) return name.startsWith(q)
  return name.startsWith(q) || name.split(/\s+/).some((word) => word.startsWith(q))
}

/**
 * The `@query` being typed just before the caret, if any: the `@` must start
 * a word and the query can't span lines.
 */
export function activeQuery(text: string, caret: number): { start: number; query: string } | null {
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1
  const at = text.lastIndexOf('@', caret - 1)
  if (at < lineStart || caret - at > 40) return null
  if (isWordChar(text[at - 1])) return null
  return { start: at, query: text.slice(at + 1, caret) }
}

/**
 * Replaces the shown text between `a` and `b` with `inserted` (stored text,
 * which may hold mentions). A mention the range cuts into turns into plain
 * text; mentions that only touch the range are kept.
 */
export function replaceRange(stored: string, lookup: Lookup, a: number, b: number, inserted: string): string {
  let before = ''
  let after = ''
  let start = 0
  for (const s of parseMentions(stored, lookup)) {
    const end = start + s.text.length
    const raw = s.kind === 'mention' ? mentionToken(s.id) : s.text
    if (end <= a) before += raw
    else if (start >= b) after += raw
    else {
      if (start < a) before += s.text.slice(0, a - start)
      if (end > b) after += s.text.slice(b - start)
    }
    start = end
  }
  return before + inserted + after
}

/**
 * Works out which part of `prev` was replaced to turn it into `next`, given
 * where the caret ended up (edits end at the caret). Falls back to a plain
 * prefix/suffix comparison when the caret doesn't fit.
 */
export function diffEdit(prev: string, next: string, caret: number): { a: number; b: number; inserted: string } {
  const tail = next.length - caret
  if (caret >= 0 && tail >= 0 && tail <= prev.length && prev.endsWith(next.slice(caret))) {
    const b = prev.length - tail
    const max = Math.min(b, caret)
    let a = 0
    while (a < max && prev[a] === next[a]) a++
    return { a, b, inserted: next.slice(a, caret) }
  }
  let a = 0
  while (a < prev.length && a < next.length && prev[a] === next[a]) a++
  let pe = prev.length
  let ne = next.length
  while (pe > a && ne > a && prev[pe - 1] === next[ne - 1]) {
    pe--
    ne--
  }
  return { a, b: pe, inserted: next.slice(a, ne) }
}

/**
 * Turns typed `@Name` into mentions when the name matches a character's
 * (ignoring case; longest name wins) and isn't followed by more of a word. `skipAt` is the
 * shown position of an `@` the user is still typing. Returns the new stored
 * text and the caret moved back for each `@` removed before it.
 */
export function linkTyped(
  stored: string,
  characters: Named[],
  lookup: Lookup,
  opts: { skipAt?: number | null; caret?: number } = {},
): { stored: string; caret: number } {
  const caret = opts.caret ?? 0
  if (characters.length === 0 || !/@(?!\{)/.test(stored)) return { stored, caret }
  const names = characters
    .map((c) => ({ id: c.id, lower: displayName(c).toLowerCase() }))
    .sort((x, y) => y.lower.length - x.lower.length)
  const segments = parseMentions(stored, lookup)
  const display = segments.map((s) => s.text).join('')
  let out = ''
  let offset = 0
  let removed = 0
  for (const s of segments) {
    if (s.kind === 'mention') {
      out += mentionToken(s.id)
      offset += s.text.length
      continue
    }
    const t = s.text
    let i = 0
    while (i < t.length) {
      const at = t.indexOf('@', i)
      if (at === -1) {
        out += t.slice(i)
        break
      }
      out += t.slice(i, at)
      const pos = offset + at
      const match =
        pos !== opts.skipAt && !isWordChar(display[pos - 1])
          ? names.find(
              (n) =>
                t.slice(at + 1, at + 1 + n.lower.length).toLowerCase() === n.lower &&
                !isWordChar(display[pos + 1 + n.lower.length]),
            )
          : undefined
      if (match) {
        out += mentionToken(match.id)
        if (pos < caret) removed++
        i = at + 1 + match.lower.length
      } else {
        out += '@'
        i = at + 1
      }
    }
    offset += t.length
  }
  return { stored: out, caret: caret - removed }
}

/**
 * Applies an edit made in a text field showing `toDisplay(stored)`: `next` is
 * the field's new text and `caret` where the caret is now. Mentions outside
 * the edit are kept, and a finished `@Name` becomes a mention (except the one
 * at `activeAt`, still being typed).
 */
export function applyTextEdit(
  stored: string,
  characters: Named[],
  lookup: Lookup,
  next: string,
  caret: number,
  activeAt: number | null = null,
): { stored: string; caret: number } {
  const prev = toDisplay(stored, lookup)
  const replaced =
    prev === next
      ? stored
      : (() => {
          const { a, b, inserted } = diffEdit(prev, next, caret)
          return replaceRange(stored, lookup, a, b, inserted)
        })()
  return linkTyped(replaced, characters, lookup, { skipAt: activeAt, caret })
}
