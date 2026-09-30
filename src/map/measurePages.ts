import type { RichNode } from '../types'
import { BEAT_MARK, MENTION_NODE } from '../lib/richText'
import { countWords, splitParagraph, type PageBlock } from './pages'

// Splits a chapter into pages that exactly fill the paper on screen: each
// block is laid out in a hidden copy of the page, and a paragraph that runs
// off the bottom is cut at the last word that still fits, as in a book.

const MARK_TAGS: Record<string, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' }

/** The block as plain DOM, typeset like the page (colours don't matter for size). */
function toDom(node: RichNode, name: (id: string) => string): Node {
  if (node.type === 'text') {
    let out: Node = document.createTextNode(node.text ?? '')
    for (const mark of node.marks ?? []) {
      const tag = mark.type === BEAT_MARK ? 'span' : MARK_TAGS[mark.type]
      if (!tag) continue
      const el = document.createElement(tag)
      el.append(out)
      out = el
    }
    return out
  }
  if (node.type === MENTION_NODE) {
    const el = document.createElement('span')
    el.className = 'mention'
    el.textContent = name(String(node.attrs?.id ?? ''))
    return el
  }
  if (node.type === 'hardBreak') return document.createElement('br')
  const tag =
    node.type === 'paragraph'
      ? 'p'
      : node.type === 'heading'
        ? ['h3', 'h4', 'h5'][Math.min(3, Math.max(1, Number(node.attrs?.level) || 1)) - 1]
        : node.type === 'blockquote'
          ? 'blockquote'
          : node.type === 'bulletList'
            ? 'ul'
            : node.type === 'orderedList'
              ? 'ol'
              : node.type === 'listItem'
                ? 'li'
                : node.type === 'horizontalRule'
                  ? 'hr'
                  : 'div'
  const el = document.createElement(tag)
  for (const child of node.content ?? []) el.append(toDom(child, name))
  return el
}

const isBlank = (node: RichNode) => node.type === 'paragraph' && countWords(node) === 0

interface Room {
  /** Height the text may take on the first page (below the chapter heading) and on the rest. */
  first: number
  rest: number
}

/**
 * Pages for a chapter, measured in `host`: an off-screen `.map-rich` as wide
 * as the page's text. `name` gives a mentioned character's name.
 */
export function measurePages(doc: RichNode | undefined, host: HTMLElement, room: Room, name: (id: string) => string): PageBlock[][] {
  const pages: PageBlock[][] = []
  let page: PageBlock[] = []
  let limit = room.first
  const setFirst = (first: boolean) => host.classList.toggle('first-page', first)
  const fits = () => host.offsetHeight <= limit
  const put = (b: PageBlock) => {
    const el = toDom(b.node, name) as HTMLElement
    if (b.continued) el.classList?.add('continued')
    host.append(el)
    return el
  }
  const turn = () => {
    if (page.length) {
      pages.push(page)
      limit = room.rest
      setFirst(false)
    }
    page = []
    host.replaceChildren()
  }
  host.replaceChildren()
  setFirst(true)

  for (const block of doc?.content ?? []) {
    let rest: RichNode | null = block
    let continued = false
    while (rest) {
      // Blank lines at the top of a page would only push the text down.
      if (!page.length && isBlank(rest)) break
      const current: RichNode = rest
      const el = put({ node: current, continued })
      if (fits()) {
        page.push({ node: current, continued })
        rest = null
        continue
      }
      el.remove()
      if (current.type === 'paragraph') {
        // The most words of this paragraph that still fit on the page.
        let lo = 0
        let hi = countWords(current) - 1
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2)
          const probe = put({ node: splitParagraph(current, mid)[0], continued })
          const ok = fits()
          probe.remove()
          if (ok) lo = mid
          else hi = mid - 1
        }
        const [head, tail] = lo > 0 ? splitParagraph(current, lo) : [current, null]
        if (tail) {
          page.push({ node: head, continued })
          turn()
          rest = tail
          continued = true
          continue
        }
      }
      if (!page.length) {
        // Taller than a whole page on its own: it gets a page and scrolls.
        page.push({ node: current, continued })
        turn()
        rest = null
        continue
      }
      // Keep a heading with the text after it.
      const heading = page.length > 1 && page[page.length - 1].node.type === 'heading' ? page.pop() : undefined
      turn()
      if (heading) {
        put(heading)
        page.push(heading)
      }
    }
  }
  turn()
  host.replaceChildren()
  return pages.filter((blocks) => blocks.some((b) => !isBlank(b.node)))
}
