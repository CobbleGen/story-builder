import type { BookStyle } from '../types'

// How the whole manuscript looks: its typeface, size and spacing, how
// paragraphs and chapters open, the mark between scenes, and the pages it's
// set on. The same style shows in the manuscript as you write and in the
// PDF and Word files exported in the book style.

export interface BookFont {
  id: string
  /** Its name, as shown and as Word knows it. */
  name: string
  kind: 'serif' | 'sans' | 'mono'
  /** On Google Fonts: the family and the styles wanted. */
  family: string
  axes: string
  /** In CSS, with fallbacks while it loads (or if it can't). */
  stack: string
  note: string
}

const SERIF = "Georgia, 'Times New Roman', serif"
const ALL = 'ital,wght@0,400;0,700;1,400;1,700'

export const FONTS: BookFont[] = [
  { id: 'source-serif', name: 'Source Serif 4', kind: 'serif', family: 'Source Serif 4', axes: ALL, stack: `'Source Serif 4', 'Iowan Old Style', ${SERIF}`, note: 'Clear and even (the usual)' },
  { id: 'eb-garamond', name: 'EB Garamond', kind: 'serif', family: 'EB Garamond', axes: ALL, stack: `'EB Garamond', Garamond, ${SERIF}`, note: 'Classic, for literary books' },
  { id: 'libre-baskerville', name: 'Libre Baskerville', kind: 'serif', family: 'Libre Baskerville', axes: ALL, stack: `'Libre Baskerville', Baskerville, ${SERIF}`, note: 'Wide and stately' },
  { id: 'crimson-pro', name: 'Crimson Pro', kind: 'serif', family: 'Crimson Pro', axes: ALL, stack: `'Crimson Pro', ${SERIF}`, note: 'Old-style, light on the page' },
  { id: 'lora', name: 'Lora', kind: 'serif', family: 'Lora', axes: ALL, stack: `'Lora', ${SERIF}`, note: 'Warm, with soft curves' },
  { id: 'literata', name: 'Literata', kind: 'serif', family: 'Literata', axes: ALL, stack: `'Literata', ${SERIF}`, note: 'Made for reading e-books' },
  { id: 'merriweather', name: 'Merriweather', kind: 'serif', family: 'Merriweather', axes: ALL, stack: `'Merriweather', ${SERIF}`, note: 'Sturdy, easy on screens' },
  { id: 'alegreya', name: 'Alegreya', kind: 'serif', family: 'Alegreya', axes: ALL, stack: `'Alegreya', ${SERIF}`, note: 'Lively, calligraphic' },
  { id: 'cormorant', name: 'Cormorant Garamond', kind: 'serif', family: 'Cormorant Garamond', axes: ALL, stack: `'Cormorant Garamond', Garamond, ${SERIF}`, note: 'Elegant (best a little larger)' },
  { id: 'inter', name: 'Inter', kind: 'sans', family: 'Inter', axes: ALL, stack: "'Inter', system-ui, sans-serif", note: 'Modern, without serifs' },
  { id: 'atkinson', name: 'Atkinson Hyperlegible', kind: 'sans', family: 'Atkinson Hyperlegible', axes: ALL, stack: "'Atkinson Hyperlegible', system-ui, sans-serif", note: 'Letters hard to mistake' },
  { id: 'courier-prime', name: 'Courier Prime', kind: 'mono', family: 'Courier Prime', axes: ALL, stack: "'Courier Prime', 'Courier New', Courier, monospace", note: 'Typewriter, as manuscripts once were' },
]

export const fontOf = (id: string): BookFont => FONTS.find((f) => f.id === id) ?? FONTS[0]

/** The font's styles from Google Fonts (only `text`'s letters, for showing its name). */
export const fontUrl = (font: BookFont, text?: string) =>
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family).replace(/%20/g, '+')}:${text ? 'wght@400' : font.axes}${text ? `&text=${encodeURIComponent(text)}` : ''}&display=swap`

/** Loads a font for the page (once). */
export function loadFont(font: BookFont, text?: string) {
  if (typeof document === 'undefined') return
  const href = fontUrl(font, text)
  if (document.head.querySelector(`link[data-font="${CSS.escape(href)}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.font = href
  document.head.appendChild(link)
}

export interface PageSize {
  id: string
  name: string
  note: string
  /** In inches. */
  width: number
  height: number
  margin: { top: number; bottom: number; side: number }
}

export const PAGE_SIZES: PageSize[] = [
  { id: 'trade', name: 'Trade paperback', note: '6 × 9 in', width: 6, height: 9, margin: { top: 0.75, bottom: 0.8, side: 0.75 } },
  { id: 'digest', name: 'Digest', note: '5.5 × 8.5 in', width: 5.5, height: 8.5, margin: { top: 0.7, bottom: 0.75, side: 0.7 } },
  { id: 'pocket', name: 'Pocket book', note: '4.25 × 6.87 in', width: 4.25, height: 6.87, margin: { top: 0.55, bottom: 0.6, side: 0.5 } },
  { id: 'a5', name: 'A5', note: '148 × 210 mm', width: 5.83, height: 8.27, margin: { top: 0.75, bottom: 0.8, side: 0.7 } },
  { id: 'letter', name: 'US Letter', note: '8.5 × 11 in', width: 8.5, height: 11, margin: { top: 1, bottom: 1, side: 1 } },
  { id: 'a4', name: 'A4', note: '210 × 297 mm', width: 8.27, height: 11.69, margin: { top: 1, bottom: 1, side: 1 } },
]

export const pageSizeOf = (id: string): PageSize => PAGE_SIZES.find((p) => p.id === id) ?? PAGE_SIZES[0]

export interface SceneBreak {
  id: string
  /** As it's shown; empty for a blank line. */
  mark: string
  name: string
}

export const SCENE_BREAKS: SceneBreak[] = [
  { id: 'asterism', mark: '⁂', name: 'Asterism' },
  { id: 'stars', mark: '*  *  *', name: 'Three stars' },
  { id: 'fleuron', mark: '❧', name: 'Fleuron' },
  { id: 'diamond', mark: '◆', name: 'Diamond' },
  { id: 'dots', mark: '·  ·  ·', name: 'Dots' },
  { id: 'hash', mark: '#', name: 'Hash' },
  { id: 'blank', mark: '', name: 'A blank line' },
]

export const sceneBreakOf = (id: string): SceneBreak => SCENE_BREAKS.find((b) => b.id === id) ?? SCENE_BREAKS[0]

export const LEADINGS = { min: 1, max: 2.4 }
export const SIZES = { min: 8, max: 20 }

export const DEFAULT_STYLE: BookStyle = {
  font: 'source-serif',
  size: 12,
  leading: 1.75,
  paragraphs: 'indent',
  align: 'left',
  hyphenate: true,
  initial: 'none',
  smallCaps: false,
  numbering: 'chapter-number',
  headingAlign: 'left',
  sceneBreak: 'asterism',
  pages: false,
  pageSize: 'trade',
  chapterPage: true,
  width: 'medium',
}

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback
const within = (value: unknown, min: number, max: number, fallback: number, step: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value)) / step) * step : fallback

/** A style from a save (or a change to one), every part as it should be; what isn't, the usual. */
export function bookStyleOf(value: unknown, base: BookStyle = DEFAULT_STYLE): BookStyle {
  const raw = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return {
    font: oneOf(raw.font, FONTS.map((f) => f.id), base.font),
    size: within(raw.size, SIZES.min, SIZES.max, base.size, 0.5),
    leading: Math.round(within(raw.leading, LEADINGS.min, LEADINGS.max, base.leading, 0.05) * 100) / 100,
    paragraphs: oneOf(raw.paragraphs, ['indent', 'spaced'] as const, base.paragraphs),
    align: oneOf(raw.align, ['left', 'justify'] as const, base.align),
    hyphenate: typeof raw.hyphenate === 'boolean' ? raw.hyphenate : base.hyphenate,
    initial: oneOf(raw.initial, ['none', 'drop', 'raised'] as const, base.initial),
    smallCaps: typeof raw.smallCaps === 'boolean' ? raw.smallCaps : base.smallCaps,
    numbering: oneOf(raw.numbering, ['chapter-number', 'chapter-word', 'word', 'number', 'roman'] as const, base.numbering),
    headingAlign: oneOf(raw.headingAlign, ['left', 'center'] as const, base.headingAlign),
    sceneBreak: oneOf(raw.sceneBreak, SCENE_BREAKS.map((b) => b.id), base.sceneBreak),
    pages: typeof raw.pages === 'boolean' ? raw.pages : base.pages,
    pageSize: oneOf(raw.pageSize, PAGE_SIZES.map((p) => p.id), base.pageSize),
    chapterPage: typeof raw.chapterPage === 'boolean' ? raw.chapterPage : base.chapterPage,
    width: oneOf(raw.width, ['narrow', 'medium', 'wide'] as const, base.width),
  }
}

// ---------- Chapter numbers ----------

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

/** 21 → "Twenty-One", 105 → "One Hundred Five" (up to 9,999). */
export function numberWords(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 9999) return String(n)
  const parts: string[] = []
  if (n >= 1000) parts.push(`${ONES[Math.floor(n / 1000)]} Thousand`)
  const hundreds = Math.floor((n % 1000) / 100)
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`)
  const rest = n % 100
  if (rest) parts.push(rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ''}`)
  return parts.join(' ')
}

/** 14 → "XIV" (up to 3,999). */
export function roman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n)
  const marks: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  for (const [value, mark] of marks) {
    while (n >= value) {
      out += mark
      n -= value
    }
  }
  return out
}

/** A chapter's number as the style writes it: "Chapter 3", "Chapter Three", "Three", "3", "III". */
export function chapterNumber(style: Pick<BookStyle, 'numbering'>, n: number): string {
  switch (style.numbering) {
    case 'chapter-word':
      return `Chapter ${numberWords(n)}`
    case 'word':
      return numberWords(n)
    case 'number':
      return String(n)
    case 'roman':
      return roman(n)
    default:
      return `Chapter ${n}`
  }
}

// ---------- On screen ----------

/** Text on screen is a little larger than printed: 12 point shows at 19 pixels. */
export const SCREEN_PX_PER_PT = 19 / 12
/** An inch of page on screen, at that size. */
export const SCREEN_PX_PER_INCH = 72 * SCREEN_PX_PER_PT

/** Text widths on screen when not shown as pages (the paper's width). */
export const WIDTHS: Record<BookStyle['width'], number> = { narrow: 620, medium: 740, wide: 900 }
