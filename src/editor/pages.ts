import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

// The manuscript as pages. The text runs on as one column, and where a page
// ends, a break is put in: it fills the rest of the page, shows the page's
// number in its bottom margin, and draws the gap to the next page and that
// page's top margin. Where pages end is measured from the text as laid out
// (breaks hidden), a paragraph split between lines, keeping two lines of it
// at least on each page, and a heading with what follows it.

/** A page's measurements on screen, in pixels. */
export interface PageGeometry {
  /** The height of the text on a page, between its margins. */
  contentH: number
  /** Its top and bottom margins. */
  mt: number
  mb: number
  /** The gap between pages. */
  gap: number
}

/** A top-level block of the text, measured as laid out without breaks. */
export interface MeasuredBlock {
  /** Its position in the document (just before it). */
  pos: number
  /** A paragraph can be split between pages, at the start of a line. */
  splittable: boolean
  heading: boolean
  top: number
  bottom: number
  marginTop: number
  marginBottom: number
  /** Its lines (splittable blocks only), and where a line starting at `top` starts in the document. */
  lines?: () => { top: number; bottom: number }[]
  startOf?: (top: number) => number | null
}

export interface PageBreak {
  /** Where it goes in the document. */
  pos: number
  /** In the middle of a paragraph (at a line's start), or between blocks. */
  inline: boolean
  height: number
  /** Where the gap between pages starts, from the break's top. */
  band: number
  /** The page that ends here. */
  page: number
}

export interface Pagination {
  breaks: PageBreak[]
  /** The rest of the last page. */
  end: { height: number; page: number }
}

const EPS = 0.5

/**
 * Where the pages end, for text measured as one column whose first page's
 * text starts at `firstTop`.
 */
export function paginate(blocks: MeasuredBlock[], g: PageGeometry, firstTop: number): Pagination {
  // From one page's text to the next's.
  const step = g.mt + g.contentH + g.mb + g.gap
  const breaks: PageBreak[] = []
  let start = firstTop
  let page = 1
  // How far a block taller than a page runs over the page's foot (the page is that much longer).
  let over = 0

  const breakBefore = (i: number) => {
    const b = blocks[i]
    const prev = blocks[i - 1]
    const top = prev.bottom + prev.marginBottom
    // (The margins between the two no longer fold into one.)
    const folded = Math.min(prev.marginBottom, b.marginTop)
    breaks.push({ pos: b.pos, inline: false, height: step + over - (b.top - start) - folded, band: start + g.contentH + over + g.mb - top, page })
    start = b.top
    page++
    over = 0
  }

  let i = 0
  // The first line of the block at `i` on the page (when it's split).
  let first = 0
  let guard = 0
  while (i < blocks.length && guard++ < 100_000) {
    const b = blocks[i]
    const limit = start + g.contentH + over
    if (b.bottom <= limit + EPS) {
      i++
      first = 0
      continue
    }
    const lines = b.splittable && (first > 0 || b.top < limit - EPS) ? (b.lines?.() ?? []) : []
    if (lines.length > 1) {
      let k = first
      while (k < lines.length && lines[k].bottom <= limit + EPS) k++
      if (k >= lines.length) {
        i++
        first = 0
        continue
      }
      let at = k
      // Not one line alone at the top of a page…
      if (lines.length - at < 2 && at - first > 1) at--
      // …or at the foot of one: the paragraph starts on the next page.
      if (first === 0 && at < 2 && b.top > start + EPS && i > 0) {
        breakBefore(i)
        continue
      }
      if (at <= first) at = first + 1
      const pos = at < lines.length ? b.startOf?.(lines[at].top) : null
      if (pos == null) {
        i++
        first = 0
        continue
      }
      const line = lines[at]
      breaks.push({ pos, inline: true, height: step + over - (line.top - start), band: start + g.contentH + over + g.mb - line.top, page })
      start = line.top
      page++
      first = at
      over = 0
      continue
    }
    // Taller than a page and already at the top of one: it runs over.
    if (b.top <= start + EPS || i === 0) {
      over = Math.max(over, b.bottom - (start + g.contentH))
      i++
      first = 0
      continue
    }
    // A heading goes with what follows it.
    const prev = blocks[i - 1]
    const j = prev.heading && i - 1 > 0 && prev.top > start + EPS ? i - 1 : i
    breakBefore(j)
    i = j
    first = 0
  }
  const last = blocks[blocks.length - 1]
  const bottom = last ? last.bottom + last.marginBottom : firstTop
  return { breaks, end: { height: Math.max(0, start + g.contentH + over + g.mb - bottom), page } }
}

const near = (a: number, b: number) => Math.abs(a - b) < 1
const samePages = (a: Pagination | null, b: Pagination | null) =>
  !!a &&
  !!b &&
  a.breaks.length === b.breaks.length &&
  a.breaks.every((x, i) => {
    const y = b.breaks[i]
    return x.pos === y.pos && x.inline === y.inline && x.page === y.page && near(x.height, y.height) && near(x.band, y.band)
  }) &&
  a.end.page === b.end.page &&
  near(a.end.height, b.end.height)

// ---------- Measuring ----------

/** Where the line whose box starts at `top` starts in the document: its first character's position. */
function startOf(view: EditorView, dom: HTMLElement, top: number): number | null {
  const texts: Text[] = []
  const starts: number[] = []
  let total = 0
  const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('.page-break') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!n.length) continue
    texts.push(n)
    starts.push(total)
    total += n.length
  }
  if (!total) return null
  const range = document.createRange()
  const at = (c: number): [Text, number] => {
    let lo = 0
    let hi = texts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= c) lo = mid
      else hi = mid - 1
    }
    return [texts[lo], c - starts[lo]]
  }
  // The middle of a character's box (or of the next one with a box: spaces folded away have none).
  const middle = (c: number): number => {
    for (let d = c; d < total && d < c + 8; d++) {
      const [node, offset] = at(d)
      range.setStart(node, offset)
      range.setEnd(node, offset + 1)
      const r = range.getBoundingClientRect()
      if (r.height) return (r.top + r.bottom) / 2
    }
    return Infinity
  }
  let lo = 0
  let hi = total
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (middle(mid) >= top) hi = mid
    else lo = mid + 1
  }
  if (lo >= total) return null
  const [node, offset] = at(lo)
  return view.posAtDOM(node, offset)
}

/** A paragraph's lines, from its text's boxes: each line's box runs from halfway to the one before to halfway to the next. */
function linesOf(dom: HTMLElement, box: DOMRect): { top: number; bottom: number }[] {
  const range = document.createRange()
  range.selectNodeContents(dom)
  const rects = [...range.getClientRects()].filter((r) => r.height > 0)
  const heights = rects.map((r) => r.height).sort((a, b) => a - b)
  const median = heights[heights.length >> 1] ?? 0
  // (A drop cap's box is left out: it spans lines.)
  const usable = rects.filter((r) => r.height <= median * 1.6).sort((a, b) => a.top - b.top)
  const rows: { top: number; bottom: number }[] = []
  for (const r of usable) {
    const row = rows[rows.length - 1]
    if (row && r.top < row.bottom - Math.min(r.height, row.bottom - row.top) / 2) {
      row.top = Math.min(row.top, r.top)
      row.bottom = Math.max(row.bottom, r.bottom)
    } else rows.push({ top: r.top, bottom: r.bottom })
  }
  return rows.map((row, i) => ({
    top: i === 0 ? box.top : (rows[i - 1].bottom + row.top) / 2,
    bottom: i === rows.length - 1 ? box.bottom : (row.bottom + rows[i + 1].top) / 2,
  }))
}

function measure(view: EditorView, g: PageGeometry): Pagination | null {
  const holder = view.dom.parentElement
  const paper = view.dom.closest('.write-paper')
  if (!holder || !paper) return null
  const scroller = view.dom.closest('.write-scroll')
  const scrollTop = scroller?.scrollTop ?? 0
  holder.classList.add('pages-measuring')
  try {
    const rect = paper.getBoundingClientRect()
    const blocks: MeasuredBlock[] = []
    view.state.doc.forEach((node, offset) => {
      const dom = view.nodeDOM(offset)
      if (!(dom instanceof HTMLElement)) return
      const box = dom.getBoundingClientRect()
      const css = getComputedStyle(dom)
      const splittable = node.type.name === 'paragraph'
      blocks.push({
        pos: offset,
        splittable,
        heading: node.type.name === 'heading',
        top: box.top,
        bottom: box.bottom,
        marginTop: parseFloat(css.marginTop) || 0,
        marginBottom: parseFloat(css.marginBottom) || 0,
        ...(splittable ? { lines: () => linesOf(dom, box), startOf: (top: number) => startOf(view, dom, top) } : {}),
      })
    })
    return paginate(blocks, g, rect.top + paper.clientTop + g.mt)
  } finally {
    holder.classList.remove('pages-measuring')
    if (scroller) scroller.scrollTop = scrollTop
  }
}

// ---------- The breaks ----------

function breakDom(b: { height: number; band?: number; page: number; inline?: boolean }, g: PageGeometry): HTMLElement {
  const el = document.createElement('span')
  el.className = `page-break${b.inline ? ' inline' : ''}`
  el.contentEditable = 'false'
  el.setAttribute('aria-hidden', 'true')
  el.style.height = `${Math.max(0, b.height)}px`
  const footTop = (b.band ?? b.height) - g.mb / 2
  const number = document.createElement('span')
  number.className = 'page-number'
  number.textContent = String(b.page)
  number.style.top = `${footTop}px`
  number.style.transform = 'translateY(-50%)'
  el.append(number)
  if (b.band !== undefined) {
    const band = document.createElement('span')
    band.className = 'page-band'
    band.style.top = `${b.band}px`
    el.append(band)
  }
  return el
}

interface PagesState {
  geometry: PageGeometry | null
  pages: Pagination | null
  set: DecorationSet
}

export const pagesKey = new PluginKey<PagesState>('pages')

function decorate(state: EditorState, g: PageGeometry | null, pages: Pagination | null): DecorationSet {
  if (!g || !pages) return DecorationSet.empty
  const size = state.doc.content.size
  const widgets = pages.breaks
    .filter((b) => b.pos >= 0 && b.pos <= size)
    .map((b) =>
      Decoration.widget(b.pos, () => breakDom(b, g), {
        side: -1,
        marks: [],
        ignoreSelection: true,
        key: `page:${b.page}:${b.inline ? 'i' : 'b'}:${Math.round(b.height)}:${Math.round(b.band)}`,
      }),
    )
  widgets.push(
    Decoration.widget(size, () => breakDom({ height: pages.end.height, page: pages.end.page }, g), {
      side: 1,
      marks: [],
      ignoreSelection: true,
      key: `page-end:${pages.end.page}:${Math.round(pages.end.height)}`,
    }),
  )
  return DecorationSet.create(state.doc, widgets)
}

/** Shows the text as pages of this size (or, with null, as one column again). */
export function setPageGeometry(view: EditorView, geometry: PageGeometry | null) {
  // (Nothing to change, nothing sent: a change, however small, lets other plugins change the text.)
  if ((pagesKey.getState(view.state)?.geometry ?? null) === geometry) return
  view.dispatch(view.state.tr.setMeta(pagesKey, { geometry }).setMeta('addToHistory', false))
}

/** How many pages the chapter is, while shown as pages. */
export const pageCount = (state: EditorState) => pagesKey.getState(state)?.pages?.end.page ?? null

export const Pages = Extension.create({
  name: 'pages',
  addProseMirrorPlugins() {
    return [
      new Plugin<PagesState>({
        key: pagesKey,
        state: {
          init: () => ({ geometry: null, pages: null, set: DecorationSet.empty }),
          apply(tr, value, _old, state) {
            const meta = tr.getMeta(pagesKey) as Partial<Pick<PagesState, 'geometry' | 'pages'>> | undefined
            if (meta) {
              const geometry = 'geometry' in meta ? (meta.geometry ?? null) : value.geometry
              const pages = !geometry ? null : 'pages' in meta ? (meta.pages ?? null) : value.pages
              return { geometry, pages, set: decorate(state, geometry, pages) }
            }
            return tr.docChanged ? { ...value, set: value.set.map(tr.mapping, tr.doc) } : value
          },
        },
        props: {
          decorations: (state) => pagesKey.getState(state)?.set,
        },
        view(view) {
          let queued = false
          const run = () => {
            queued = false
            if (view.isDestroyed) return
            // Not in the middle of composing a character (accents, Chinese, Japanese…): once it's in.
            if (view.composing) {
              view.dom.addEventListener('compositionend', schedule, { once: true })
              return
            }
            const state = pagesKey.getState(view.state)
            if (!state?.geometry) return
            const pages = measure(view, state.geometry)
            if (pages && !samePages(pages, state.pages)) {
              view.dispatch(view.state.tr.setMeta(pagesKey, { pages }).setMeta('addToHistory', false))
            }
          }
          const schedule = () => {
            if (queued) return
            queued = true
            queueMicrotask(run)
          }
          const resized = new ResizeObserver(schedule)
          resized.observe(view.dom)
          document.fonts?.addEventListener('loadingdone', schedule)
          return {
            update(next, before) {
              const now = pagesKey.getState(next.state)
              const was = pagesKey.getState(before)
              if (now?.geometry && (next.state.doc !== before.doc || now.geometry !== was?.geometry)) schedule()
            },
            destroy() {
              resized.disconnect()
              document.fonts?.removeEventListener('loadingdone', schedule)
            },
          }
        },
      }),
    ]
  },
})
