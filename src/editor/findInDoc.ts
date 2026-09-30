import type { Node as PmNode } from '@tiptap/pm/model'
import { MENTION_NODE } from '../lib/richText'
import { fold, type TextFind } from '../lib/search'

interface Block {
  node: PmNode
  pos: number
}

/**
 * Where a search result is in the open chapter: the first of the words in the
 * paragraph it named, or failing that (the text changed meanwhile) anywhere.
 * Paragraphs are counted as lib/search counts them; mentions read as names.
 */
export function findInDoc(doc: PmNode, find: TextFind, nameOf: (id: string) => string): { from: number; to: number } | null {
  const blocks: Block[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    blocks.push({ node, pos })
    return false
  })
  const first = blocks[find.block]
  for (const block of first ? [first, ...blocks.filter((b) => b !== first)] : blocks) {
    const range = findInBlock(block, find.terms, nameOf)
    if (range) return range
  }
  return null
}

function findInBlock({ node, pos }: Block, terms: string[], nameOf: (id: string) => string) {
  const parts: { at: number; start: number; length: number; isText: boolean; size: number }[] = []
  let text = ''
  node.forEach((child, offset) => {
    const piece = child.isText ? (child.text ?? '') : child.type.name === MENTION_NODE ? nameOf(String(child.attrs.id)) : ' '
    parts.push({ at: pos + 1 + offset, start: text.length, length: piece.length, isText: child.isText, size: child.nodeSize })
    text += piece
  })
  const folded = fold(text)
  let start = -1
  let length = 0
  for (const term of terms) {
    const i = folded.indexOf(term)
    if (i !== -1 && (start === -1 || i < start)) {
      start = i
      length = term.length
    }
  }
  if (start === -1) return null
  // A match that starts or ends inside a mention takes in the whole mention.
  const toPos = (offset: number, end: boolean) => {
    for (const p of parts) {
      if (end ? offset <= p.start + p.length : offset < p.start + p.length) {
        if (p.isText) return p.at + (offset - p.start)
        return end ? p.at + p.size : p.at
      }
    }
    return pos + node.nodeSize - 1
  }
  return { from: toPos(start, false), to: toPos(start + length, true) }
}
