import { describe, expect, it } from 'vitest'
import { paginate, type MeasuredBlock, type PageGeometry } from './pages'

// Pages 100px of text tall, with 20px margins and a 10px gap between them: 150px from one page's text to the next's.
const g: PageGeometry = { contentH: 100, mt: 20, mb: 20, gap: 10 }
const LINE = 10

/** A paragraph of `lines` lines from `top`; a line starts at document position pos + 1 + 10 × its number. */
const para = (pos: number, top: number, lines: number): MeasuredBlock => ({
  pos,
  splittable: true,
  heading: false,
  top,
  bottom: top + lines * LINE,
  marginTop: 0,
  marginBottom: 0,
  lines: () => Array.from({ length: lines }, (_, i) => ({ top: top + i * LINE, bottom: top + (i + 1) * LINE })),
  startOf: (lineTop) => pos + 1 + Math.round((lineTop - top) / LINE) * 10,
})
const block = (pos: number, top: number, height: number, extra: Partial<MeasuredBlock> = {}): MeasuredBlock => ({
  pos,
  splittable: false,
  heading: false,
  top,
  bottom: top + height,
  marginTop: 0,
  marginBottom: 0,
  ...extra,
})

describe('pages', () => {
  it('is one page when it all fits, filled to the page’s foot', () => {
    expect(paginate([para(0, 0, 4), para(50, 40, 3)], g, 0)).toEqual({ breaks: [], end: { height: 30 + 20, page: 1 } })
  })

  it('splits a paragraph at the line that doesn’t fit', () => {
    // Lines at 60…140: six fit (to 120?) — the page's text ends at 100, so four lines (60–100) fit.
    const pages = paginate([para(0, 0, 6), para(100, 60, 9)], g, 0)
    expect(pages.breaks).toEqual([{ pos: 100 + 1 + 4 * 10, inline: true, height: 150 - 100, band: 20, page: 1 }])
    // The second page starts at the fifth line (100) and ends at 150; the text ends at 150.
    expect(pages.end).toEqual({ height: 100 + 20 - 50, page: 2 })
  })

  it('keeps two lines of a paragraph together at the foot of a page and the top of the next', () => {
    // Only one line would fit at the foot: the paragraph starts on the next page.
    const orphan = paginate([para(0, 0, 9), para(100, 90, 5)], g, 0)
    expect(orphan.breaks).toEqual([{ pos: 100, inline: false, height: 150 - 90, band: 30, page: 1 }])
    // Only one line would go over: two do.
    const widow = paginate([para(0, 0, 3), para(100, 30, 8)], g, 0)
    expect(widow.breaks).toEqual([{ pos: 100 + 1 + 6 * 10, inline: true, height: 150 - 90, band: 30, page: 1 }])
  })

  it('splits a long paragraph over several pages', () => {
    const pages = paginate([para(0, 0, 25)], g, 0)
    expect(pages.breaks.map((b) => [b.pos, b.page])).toEqual([
      [101, 1],
      [201, 2],
    ])
    expect(pages.end).toEqual({ height: 100 + 20 - 50, page: 3 })
  })

  it('starts a block that can’t be split on the next page, and a heading with it', () => {
    const picture = paginate([para(0, 0, 6), block(100, 60, 80)], g, 0)
    expect(picture.breaks).toEqual([{ pos: 100, inline: false, height: 150 - 60, band: 60, page: 1 }])
    const heading = paginate([para(0, 0, 6), block(100, 60, 20, { heading: true }), block(200, 80, 50)], g, 0)
    expect(heading.breaks.map((b) => b.pos)).toEqual([100])
  })

  it('lets a block taller than a page run over, its page that much longer', () => {
    const pages = paginate([block(0, 0, 250), para(100, 250, 2)], g, 0)
    expect(pages.breaks).toEqual([{ pos: 100, inline: false, height: 150 + 150 - 250, band: 100 + 150 + 20 - 250, page: 1 }])
    expect(pages.end).toEqual({ height: 100 + 20 - 20, page: 2 })
  })

  it('takes margins between blocks into account', () => {
    // A 12px margin above the block that goes over (and 4px below the one before) fold into 12px; with the break between, they don't.
    const pages = paginate([block(0, 0, 70, { marginBottom: 4 }), block(100, 82, 40, { marginTop: 12 })], g, 0)
    expect(pages.breaks).toEqual([{ pos: 100, inline: false, height: 150 - 82 - 4, band: 100 + 20 - 74, page: 1 }])
  })
})
