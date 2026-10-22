import type { RichNode } from '../types'
import { MENTION_NODE, mergeText } from './richText'

// Find and replace in the manuscript. Matches are found paragraph by
// paragraph in the text as written: a mention (a name linked with @) or a
// line break is not text, so no match runs through one, and linked names
// change only when the character or place is renamed.

export interface FindQuery {
  text: string
  matchCase: boolean
  wholeWord: boolean
}

/** Stands for anything in a paragraph that isn't text. */
export const OBJECT = '￼'

const WORD = '[\\p{L}\\p{N}_]'
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The query as a pattern (null when there's nothing to find). */
export function matcher(q: FindQuery): RegExp | null {
  if (!q.text) return null
  const body = escape(q.text)
  return new RegExp(q.wholeWord ? `(?<!${WORD})${body}(?!${WORD})` : body, q.matchCase ? 'gu' : 'giu')
}

/** Where the pattern is found in some text: [start, end) pairs, in order, not overlapping. */
export function findIn(text: string, re: RegExp): [number, number][] {
  const out: [number, number][] = []
  for (const m of text.matchAll(re)) if (m[0].length) out.push([m.index, m.index + m[0].length])
  return out
}

const TEXTBLOCKS = new Set(['paragraph', 'heading'])

/** A paragraph's text, with OBJECT for each mention or line break. */
const blockText = (block: RichNode) => (block.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : OBJECT)).join('')

/** How many times the pattern is found in a chapter's saved text. */
export function countInDoc(doc: RichNode, re: RegExp): number {
  if (TEXTBLOCKS.has(doc.type)) return findIn(blockText(doc), re).length
  return (doc.content ?? []).reduce((n, child) => n + countInDoc(child, re), 0)
}

/** A paragraph with every match replaced; the new text takes the formatting where each match began. */
function replaceInBlock(block: RichNode, re: RegExp, replacement: string): { block: RichNode; count: number } {
  const children = block.content ?? []
  const matches = findIn(blockText(block), re)
  if (!matches.length) return { block, count: 0 }
  const out: RichNode[] = []
  const piece = (text: string, like: RichNode) => {
    if (text) out.push(like.marks?.length ? { type: 'text', text, marks: like.marks } : { type: 'text', text })
  }
  let start = 0
  for (const child of children) {
    const text = child.type === 'text' ? (child.text ?? '') : OBJECT
    const end = start + text.length
    if (child.type !== 'text') {
      out.push(child)
    } else {
      let at = start
      for (const [ms, me] of matches) {
        if (me <= start || ms >= end) continue
        if (ms > at) piece(text.slice(at - start, ms - start), child)
        if (ms >= start) piece(replacement, child)
        at = Math.min(me, end)
      }
      if (at < end) piece(text.slice(at - start), child)
    }
    start = end
  }
  const content = mergeText(out)
  return { block: content.length ? { ...block, content } : { ...block, content: undefined }, count: matches.length }
}

/** A chapter's saved text with every match replaced, and how many there were. */
export function replaceInDoc(doc: RichNode, re: RegExp, replacement: string): { doc: RichNode; count: number } {
  if (TEXTBLOCKS.has(doc.type)) {
    const { block, count } = replaceInBlock(doc, re, replacement)
    return { doc: block, count }
  }
  if (!doc.content) return { doc, count: 0 }
  let count = 0
  const content = doc.content.map((child) => {
    const done = replaceInDoc(child, re, replacement)
    count += done.count
    return done.doc
  })
  return count ? { doc: { ...doc, content }, count } : { doc, count: 0 }
}

/** Words in a saved text, counted as the editor counts them (a mention is one word). */
export function wordsInDoc(doc: RichNode): number {
  const parts: string[] = []
  const walk = (node: RichNode) => {
    if (TEXTBLOCKS.has(node.type)) {
      parts.push((node.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : c.type === MENTION_NODE ? 'x' : ' ')).join(''))
      return
    }
    if (node.content) node.content.forEach(walk)
    else parts.push(' ')
  }
  walk(doc)
  return parts.join(' ').split(/\s+/).filter(Boolean).length
}
