import type { RichNode } from '../types'
import { MENTION_NODE, PICTURE_NODE } from '../lib/richText'

// Where a comment on a passage of the manuscript sits: found again by its
// words (and a little of the text either side), not by position, so it
// stays on its passage as the chapter around it changes, and an AI assistant
// can comment on a passage by quoting it. Words are matched loosely: case,
// runs of spaces and line breaks, curly or straight quotes, dashes, and the
// *Markdown* an assistant reads italics as don't matter.

/** The words a comment is on, with some of the text just before and after (to tell repeats apart). */
export interface TextAnchor {
  quote: string
  prefix?: string
  suffix?: string
}

/** How much of the text either side of a passage is kept with it. */
export const CONTEXT = 40

type NameOf = (id: string, label: unknown) => string

/**
 * A chapter's text as the editor holds it: every character with where it
 * stands in the document (ProseMirror positions), a line break between
 * blocks, and mentions as the names they show.
 */
export interface DocText {
  text: string
  /** The document position each character starts at, and ends at. */
  from: number[]
  to: number[]
}

/** Nodes with nothing inside, one position wide. */
const LEAVES = new Set([MENTION_NODE, PICTURE_NODE, 'hardBreak', 'horizontalRule', 'image'])

export function docText(doc: RichNode, nameOf: NameOf): DocText {
  let text = ''
  const from: number[] = []
  const to: number[] = []
  const add = (s: string, a: number, b: number) => {
    for (let i = 0; i < s.length; i++) {
      text += s[i]
      from.push(a)
      to.push(b)
    }
  }
  const gap = (at: number) => {
    if (text && !text.endsWith('\n')) add('\n', at, at)
  }
  const walk = (nodes: RichNode[] | undefined, start: number): number => {
    let p = start
    for (const node of nodes ?? []) {
      if (node.type === 'text') {
        const t = node.text ?? ''
        for (let i = 0; i < t.length; i++) add(t[i], p + i, p + i + 1)
        p += t.length
      } else if (node.type === MENTION_NODE) {
        add(nameOf(String(node.attrs?.id ?? ''), node.attrs?.label) || ' ', p, p + 1)
        p += 1
      } else if (node.type === 'hardBreak') {
        add('\n', p, p + 1)
        p += 1
      } else if (LEAVES.has(node.type) || (!node.content && !BLOCKS.has(node.type))) {
        gap(p)
        p += 1
        gap(p)
      } else {
        gap(p)
        p = walk(node.content, p + 1) + 1
      }
    }
    return p
  }
  walk(doc.content, 0)
  return { text, from, to }
}

/** Nodes that hold others (and take two positions, even empty). */
const BLOCKS = new Set(['doc', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock'])

// ---------- Matching loosely ----------

const FOLD: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '′': "'",
  '`': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '‟': '"',
  '″': '"',
  '«': '"',
  '»': '"',
  '–': '-',
  '—': '-',
  '―': '-',
  '−': '-',
  '…': '...',
}

/** Characters left out when matching: Markdown's emphasis marks, and invisible ones. */
const SKIP = new Set(['*', '~', '\u200b', '\u200c', '\u200d', '\u2060', '\ufeff'])

/**
 * Text folded for matching, with the index in the original each folded
 * character came from: lower case, spaces and line breaks as one space,
 * quotes and dashes alike.
 */
export function fold(text: string): { folded: string; at: number[] } {
  let folded = ''
  const at: number[] = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (SKIP.has(ch)) continue
    if (/\s/.test(ch)) {
      if (folded && !folded.endsWith(' ')) {
        folded += ' '
        at.push(i)
      }
      continue
    }
    const mapped = FOLD[ch] ?? ch.toLowerCase()
    // (A few characters change length when lower-cased; keep those as they are.)
    const out = mapped.length === ch.length || FOLD[ch] ? mapped : ch
    for (const c of out) {
      folded += c
      at.push(i)
    }
  }
  return { folded, at }
}

const folded = (text: string) => fold(text).folded.trim()

/** Where a passage is found: document positions, and whether its words are still as they were. */
export interface Found {
  from: number
  to: number
  /** False when only the text either side was found: the passage's own words have changed. */
  exact: boolean
}

/** How many characters two strings share at their ends (`a`'s end and `b`'s start, or both ends). */
function sharedEnd(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}
function sharedStart(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

function allIndexes(haystack: string, needle: string): number[] {
  const out: number[] = []
  if (!needle) return out
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) out.push(i)
  return out
}

/** Folded positions [start, end) in the document's raw text: its first and last characters. */
function rawRange(text: DocText, at: number[], start: number, end: number): { first: number; last: number } {
  let first = at[start]
  let last = at[end - 1]
  // Never start or end on the line break between blocks.
  while (first < last && /\s/.test(text.text[first])) first++
  while (last > first && /\s/.test(text.text[last])) last--
  return { first, last }
}

/**
 * Finds a passage in a chapter's text: where its words are (the repeat whose
 * surroundings match best), or failing that, between the text that was just
 * before and after it (its own words changed). Null when it's gone.
 */
export function findAnchor(text: DocText, anchor: TextAnchor): Found | null {
  const { folded: hay, at } = fold(text.text)
  const quote = folded(anchor.quote)
  if (!quote) return null
  const before = folded(anchor.prefix ?? '')
  const after = folded(anchor.suffix ?? '')
  const hits = allIndexes(hay, quote)
  if (hits.length) {
    let best = hits[0]
    let bestScore = -1
    for (const i of hits) {
      const score = sharedEnd(hay.slice(Math.max(0, i - before.length - 1), i).trimEnd(), before) + sharedStart(hay.slice(i + quote.length).trimStart(), after)
      if (score > bestScore) {
        best = i
        bestScore = score
      }
    }
    const { first, last } = rawRange(text, at, best, best + quote.length)
    return { from: text.from[first], to: text.to[last], exact: true }
  }
  // The words changed: between what was before and after them, if both are still there close together.
  const lead = before.slice(-24)
  const tail = after.slice(0, 24)
  if (lead.length < 8 || tail.length < 8) return null
  const most = Math.max(quote.length * 2, quote.length + 200)
  let pick: { start: number; end: number } | null = null
  for (const i of allIndexes(hay, lead)) {
    const start = i + lead.length
    const j = hay.indexOf(tail, start)
    if (j === -1 || j - start > most) continue
    if (!pick || Math.abs(j - start - quote.length) < Math.abs(pick.end - pick.start - quote.length)) pick = { start, end: j }
  }
  if (!pick || pick.end - pick.start < 1) return null
  const { first, last } = rawRange(text, at, pick.start, pick.end)
  if (last < first || !text.text.slice(first, last + 1).trim()) return null
  return { from: text.from[first], to: text.to[last], exact: false }
}

/** The passage between two document positions, as an anchor (its words, and some either side). */
export function anchorAt(text: DocText, from: number, to: number): TextAnchor | null {
  let first = text.from.findIndex((p) => p >= from)
  let last = -1
  for (let i = text.to.length - 1; i >= 0; i--) {
    if (text.to[i] <= to) {
      last = i
      break
    }
  }
  if (first === -1 || last < first) return null
  while (first < last && /\s/.test(text.text[first])) first++
  while (last > first && /\s/.test(text.text[last])) last--
  const quote = text.text.slice(first, last + 1)
  if (!quote.trim()) return null
  return anchorOf(text, first, last, quote)
}

const anchorOf = (text: DocText, first: number, last: number, quote: string): TextAnchor => ({
  quote: quote.slice(0, 2000),
  prefix: text.text.slice(Math.max(0, first - CONTEXT), first),
  suffix: text.text.slice(last + 1, last + 1 + CONTEXT),
})

/**
 * Finds the words someone quoted (as an AI assistant reads them, say) in a
 * chapter's text, as the anchor to keep: its words as written in the chapter,
 * and how many times they're there (the first is taken).
 */
export function quoteIn(text: DocText, quote: string): { anchor: TextAnchor; times: number } | null {
  const { folded: hay, at } = fold(text.text)
  const want = folded(quote)
  if (!want) return null
  const hits = allIndexes(hay, want)
  if (!hits.length) return null
  const { first, last } = rawRange(text, at, hits[0], hits[0] + want.length)
  return { anchor: anchorOf(text, first, last, text.text.slice(first, last + 1)), times: hits.length }
}

/** A passage's words for showing: on one line, cut short if long. */
export function quoteLine(quote: string, max = 160): string {
  const line = quote.replace(/\s+/g, ' ').trim()
  if (line.length <= max) return line
  const cut = line.lastIndexOf(' ', max)
  return `${line.slice(0, cut > max * 0.6 ? cut : max).trimEnd()}…`
}
