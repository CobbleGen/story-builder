import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import type { BookStyle } from '../types'
import { useStory } from '../store/storyStore'
import { SCREEN_PX_PER_INCH, SCREEN_PX_PER_PT, WIDTHS, fontOf, loadFont, pageSizeOf, sceneBreakOf } from '../lib/bookStyle'
import type { PageGeometry } from './pages'

const PAGE_GAP = 28
/** Pages are shown smaller to fit the window, but no smaller than this; narrower, the text is one column. */
const MIN_SCALE = 0.6

const inPixels = (inches: number, scale: number) => Math.round(inches * SCREEN_PX_PER_INCH * scale * 100) / 100

export interface BookLook {
  style: BookStyle
  /** Classes and variables for the manuscript page. */
  className: string
  vars: Record<string, string | number>
  /** The pages' measurements, while shown as pages. */
  geometry: PageGeometry | null
  /** Pages were asked for but the window is too narrow for them. */
  tooNarrow: boolean
}

/** The book's style as the manuscript shows it, pages scaled to the room `scroller` has. */
export function useBookStyle(scroller: RefObject<HTMLElement | null>): BookLook {
  const style = useStory((s) => s.style)
  const [room, setRoom] = useState(0)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    // The width inside its padding (which makes room for a panel beside the text).
    const measure = () => {
      const css = getComputedStyle(el)
      setRoom(el.clientWidth - (parseFloat(css.paddingLeft) || 0) - (parseFloat(css.paddingRight) || 0))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [scroller])
  const font = fontOf(style.font)
  useEffect(() => loadFont(font), [font])

  const size = pageSizeOf(style.pageSize)
  const natural = size.width * SCREEN_PX_PER_INCH
  const fits = room > 0 && room >= natural * MIN_SCALE
  const pages = style.pages && fits
  const scale = pages ? Math.min(1, room / natural) : 1
  const px = (inches: number) => inPixels(inches, scale)

  // A new one whenever the style changes, so the pages are measured again.
  const geometry = useMemo<PageGeometry | null>(
    () =>
      pages && style
        ? {
            contentH: inPixels(size.height - size.margin.top - size.margin.bottom, scale),
            mt: inPixels(size.margin.top, scale),
            mb: inPixels(size.margin.bottom, scale),
            gap: PAGE_GAP,
          }
        : null,
    [pages, scale, size, style],
  )

  const vars: Record<string, string | number> = {
    '--book-font': font.stack,
    '--book-size': `${Math.round(style.size * SCREEN_PX_PER_PT * scale * 100) / 100}px`,
    '--book-leading': style.leading,
    '--book-break': JSON.stringify(sceneBreakOf(style.sceneBreak).mark),
    '--book-width': `${WIDTHS[style.width]}px`,
  }
  if (geometry) {
    Object.assign(vars, {
      '--page-w': `${px(size.width)}px`,
      '--page-h': `${px(size.height)}px`,
      '--page-mt': `${geometry.mt}px`,
      '--page-mb': `${geometry.mb}px`,
      '--page-mx': `${px(size.margin.side)}px`,
      '--page-gap': `${PAGE_GAP}px`,
      '--page-content-h': `${geometry.contentH}px`,
      '--page-sink': `${px(size.height * 0.1)}px`,
    })
  }
  const className = [
    style.paragraphs === 'spaced' && 'book-spaced',
    style.align === 'justify' && 'book-justify',
    style.hyphenate && 'book-hyphenate',
    style.initial === 'drop' && 'book-drop',
    style.initial === 'raised' && 'book-raised',
    style.smallCaps && 'book-smallcaps',
    style.headingAlign === 'center' && 'book-center',
    pages && 'book-pages',
  ]
    .filter(Boolean)
    .join(' ')
  return { style, className, vars, geometry, tooNarrow: style.pages && room > 0 && !fits }
}
