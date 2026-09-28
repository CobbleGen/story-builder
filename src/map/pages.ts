import type { RichNode } from '../types'
import { MENTION_NODE } from '../lib/richText'

// Splits a chapter's text into pages for reading on the mind map. Pages hold
// about the same number of words; a long paragraph carries on to the next
// page, as in a book.

/** About a small paperback page, in the space a chapter card has. */
export const WORDS_PER_PAGE = 130
/** Don't start a paragraph at the foot of a page with fewer words of room than this. */
const MIN_ROOM = 25

/** A block on a page; `continued` when it's the rest of a paragraph from the page before. */
export interface PageBlock {
  node: RichNode
  continued?: boolean
}

const WORDS = /\S+/g

export function countWords(node: RichNode): number {
  if (node.type === 'text') return node.text?.match(WORDS)?.length ?? 0
  if (node.type === MENTION_NODE) return 1
  return (node.content ?? []).reduce((n, child) => n + countWords(child), 0)
}

/** The first `budget` words of a paragraph, and the rest (null if it all fits). */
function splitParagraph(p: RichNode, budget: number): [RichNode, RichNode | null] {
  const head: RichNode[] = []
  const tail: RichNode[] = []
  let used = 0
  for (const child of p.content ?? []) {
    if (tail.length) {
      tail.push(child)
      continue
    }
    const n = countWords(child)
    if (used + n <= budget) {
      head.push(child)
      used += n
      continue
    }
    if (child.type !== 'text') {
      tail.push(child)
      continue
    }
    const text = child.text ?? ''
    const cut = [...text.matchAll(WORDS)][budget - used].index
    const before = text.slice(0, cut).trimEnd()
    if (before) head.push({ ...child, text: before })
    tail.push({ ...child, text: text.slice(cut) })
  }
  if (!tail.length || !head.length) return [p, null]
  return [
    { ...p, content: head },
    { ...p, content: tail },
  ]
}

/** Splits a chapter into pages; the first page can hold fewer words (it has the chapter heading). */
export function paginate(doc: RichNode | undefined, perPage = WORDS_PER_PAGE, firstPage = perPage): PageBlock[][] {
  const pages: PageBlock[][] = []
  let page: PageBlock[] = []
  let count = 0
  let limit = firstPage
  const turn = () => {
    if (page.length) {
      pages.push(page)
      limit = perPage
    }
    page = []
    count = 0
  }
  for (const block of doc?.content ?? []) {
    let rest: RichNode | null = block
    let continued = false
    while (rest) {
      const n = countWords(rest)
      // Blank lines at the top of a page would only push the text down.
      if (!page.length && n === 0 && rest.type === 'paragraph') break
      if (count + n <= limit || (count === 0 && rest.type !== 'paragraph')) {
        page.push({ node: rest, continued })
        count += n
        rest = null
        if (count >= limit) turn()
        continue
      }
      const room = limit - count
      if (rest.type === 'paragraph' && room >= MIN_ROOM) {
        const [head, tail]: [RichNode, RichNode | null] = splitParagraph(rest, room)
        page.push({ node: head, continued })
        turn()
        rest = tail
        continued = true
      } else if (count === 0) {
        // A paragraph that can't be split any further (one enormous word).
        page.push({ node: rest, continued })
        turn()
        rest = null
      } else {
        turn()
      }
    }
  }
  turn()
  return pages.filter((blocks) => blocks.some((b) => b.node.type !== 'paragraph' || countWords(b.node) > 0))
}
