import {
  AlignmentType,
  Document,
  DropCapType,
  Footer,
  FrameAnchorType,
  FrameWrap,
  Header,
  HeadingLevel,
  ImageRun,
  LineRuleType,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  type IFrameOptions,
  type ILevelsOptions,
  type IParagraphOptions,
} from 'docx'
import type { BookStyle } from '../types'
import { aboutWords, sceneMark, type ExportPictures, type Manuscript, type Run } from './manuscript'
import { PICTURE_WIDTH } from './richText'
import { fontOf, pageSizeOf } from './bookStyle'

// The manuscript as a Word document, in the usual manuscript style: 12 point
// Times New Roman, double spaced, one-inch margins, paragraphs indented half
// an inch (except after a heading or scene break), each chapter on a new
// page with its heading a third of the way down, and the title and page
// number at the top right. Or in the book's own style: its typeface, size and
// spacing, page size, chapter openings and scene breaks, with the page number
// at the foot of each page. This module is loaded only when exporting.

const FONT = 'Times New Roman'
const INCH = 1440
const HALF_INCH = 720
const DOUBLE = 480
/** The text's width and the most a picture may be tall, in pixels (96 to the inch). */
const TEXT_PX = 6.5 * 96
const MAX_PICTURE_PX = 8 * 96

interface Extra {
  smallCaps?: boolean
  size?: number
}

function textRuns(runs: Run[], extra: (r: Run) => Extra = () => ({})): TextRun[] {
  const out: TextRun[] = []
  for (const r of runs) {
    const more = extra(r)
    r.text.split('\n').forEach((line, i) => {
      out.push(
        new TextRun({
          text: line,
          ...(i > 0 ? { break: 1 } : {}),
          ...(r.bold ? { bold: true } : {}),
          ...(r.italic ? { italics: true } : {}),
          ...(r.underline ? { underline: {} } : {}),
          ...(r.strike ? { strike: true } : {}),
          ...(more.smallCaps ? { smallCaps: true } : {}),
          ...(more.size ? { size: more.size } : {}),
        }),
      )
    })
  }
  return out
}

/** A run split in two at `at` characters. */
const splitRun = (r: Run, at: number): [Run, Run] => [{ ...r, text: r.text.slice(0, at) }, { ...r, text: r.text.slice(at) }]

/** Runs split after `chars` characters. */
function splitRuns(runs: Run[], chars: number): [Run[], Run[]] {
  const head: Run[] = []
  const tail: Run[] = []
  let left = chars
  for (const r of runs) {
    if (left <= 0) tail.push(r)
    else if (r.text.length <= left) {
      head.push(r)
      left -= r.text.length
    } else {
      const [a, b] = splitRun(r, left)
      head.push(a)
      tail.push(b)
      left = 0
    }
  }
  return [head, tail]
}

/** How many characters a chapter's first letter takes (with any opening quote or bracket). */
function initialLength(text: string): number {
  return /^[\s“"‘'(«¿¡]*[\p{L}\p{N}]/u.exec(text)?.[0].length ?? 0
}

/** The words of the first line, give or take: set in small capitals (Word can't style a first line). */
function leadIn(text: string): number {
  const words = /^(\s*\S+){1,6}/u.exec(text)
  return words ? words[0].length : text.length
}

/** A chapter's first paragraph, opened in the book's style: a drop cap (Word's own), a raised cap, small capitals. */
function openingParagraphs(runs: Run[], style: BookStyle, size: number, body: Omit<IParagraphOptions, 'children'>): Paragraph[] {
  const text = runs.map((r) => r.text).join('')
  const first = style.initial === 'none' ? 0 : initialLength(text)
  let [initial, rest] = splitRuns(runs, first)
  const out: Paragraph[] = []
  if (first && style.initial === 'drop') {
    // Three lines tall: the letter's capital reaches from the first line's capitals to the third line's foot.
    const line = style.size * style.leading
    const letter = Math.round(((2 * line + 0.68 * style.size) / 0.68) * 2)
    out.push(
      new Paragraph({
        frame: {
          type: 'absolute',
          anchor: { horizontal: FrameAnchorType.TEXT, vertical: FrameAnchorType.TEXT },
          dropCap: DropCapType.DROP,
          lines: 3,
          wrap: FrameWrap.AROUND,
        } as unknown as IFrameOptions,
        spacing: { line: Math.round(3 * line * 20), lineRule: LineRuleType.EXACT, before: 0, after: 0 },
        children: textRuns(initial, () => ({ size: letter })),
      }),
    )
    initial = []
  }
  const raised = first && style.initial === 'raised' ? textRuns(initial, () => ({ size: size * 3 })) : []
  const [lead, after] = style.smallCaps ? splitRuns(rest, leadIn(rest.map((r) => r.text).join(''))) : [[], rest]
  out.push(
    new Paragraph({
      ...body,
      indent: undefined,
      children: [...raised, ...textRuns(lead, () => ({ smallCaps: true })), ...textRuns(after)],
    }),
  )
  return out
}

const LEVELS = 6

function listLevels(ordered: boolean): ILevelsOptions[] {
  const bullets = ['•', '◦', '▪']
  return Array.from({ length: LEVELS }, (_, level) => ({
    level,
    format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
    text: ordered ? `%${level + 1}.` : bullets[level % bullets.length],
    alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: HALF_INCH * (level + 1), hanging: 360 } } },
  }))
}

export async function manuscriptDocx(m: Manuscript, pictures: ExportPictures = new Map()): Promise<Blob> {
  const style = m.style
  const page = style ? pageSizeOf(style.pageSize) : null
  // Sizes in half-points; spacing in twentieths of a point.
  const size = style ? Math.round(style.size * 2) : 24
  const font = style ? fontOf(style.font).name : FONT
  const line = style ? Math.round(style.size * style.leading * 20) : DOUBLE
  const indent = style ? (style.paragraphs === 'indent' ? Math.round(style.size * 30) : 0) : HALF_INCH
  const spaced = style?.paragraphs === 'spaced' ? Math.round(style.size * style.leading * 10) : 0
  const justify = style?.align === 'justify'
  const textWidthPx = page ? (page.width - 2 * page.margin.side) * 96 : TEXT_PX
  const maxPicturePx = page ? (page.height - page.margin.top - page.margin.bottom) * 0.9 * 96 : MAX_PICTURE_PX
  const mark = sceneMark(m)
  const children: Paragraph[] = []

  if (m.titlePage) {
    const before = page ? Math.round(page.height * 0.28 * INCH) : INCH * 3
    children.push(
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before, line: 360 }, children: [new TextRun({ text: m.title, size: style ? size * 2 : 40 })] }),
    )
    if (m.author) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 }, children: [new TextRun(`by ${m.author}`)] }))
    if (!style) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 720 }, children: [new TextRun({ text: aboutWords(m.words), size: 22 })] }))
  }

  m.chapters.forEach((c, i) => {
    const heading: TextRun[] = []
    if (c.label) heading.push(new TextRun({ text: c.label, allCaps: true, size: style ? Math.round(size * 0.8) : 24, ...(style ? { characterSpacing: Math.round(style.size * 2.4) } : {}) }))
    if (c.title) heading.push(new TextRun({ text: c.title, size: style ? Math.round(size * 1.45) : 32, ...(c.label ? { break: 1 } : {}) }))
    const newPage = (i > 0 || m.titlePage) && (style ? style.chapterPage : true)
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: newPage,
        alignment: style?.headingAlign === 'left' ? AlignmentType.LEFT : AlignmentType.CENTER,
        spacing: {
          before: page ? (newPage || i === 0 ? Math.round(page.height * 0.1 * INCH) : Math.round(line * 2)) : INCH * 2,
          after: style ? Math.round(style.size * 2.2 * 20) : DOUBLE,
          line: style ? Math.round(style.size * 1.3 * 20 * 1.45) : 360,
          ...(style ? { lineRule: LineRuleType.AT_LEAST } : {}),
        },
        keepNext: true,
        children: heading,
      }),
    )
    let flush = true
    let opened = false
    for (const b of c.blocks) {
      if (b.type === 'break') {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            ...(style ? { spacing: { before: Math.round(line / 2), after: Math.round(line / 2) } } : {}),
            children: mark ? [new TextRun(mark)] : [],
          }),
        )
        flush = true
      } else if (b.type === 'picture') {
        const picture = pictures.get(b.imageId)
        if (picture) {
          let width = textWidthPx * PICTURE_WIDTH[b.size]
          let height = (width * picture.height) / picture.width
          if (height > maxPicturePx) {
            width = (width * maxPicturePx) / height
            height = maxPicturePx
          }
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              // Single spacing that grows to the picture (some readers otherwise cut it to one line's height).
              spacing: { before: 120, after: 120, line: 240, lineRule: LineRuleType.AUTO },
              children: [
                new ImageRun({
                  type: picture.format,
                  data: picture.bytes,
                  transformation: { width: Math.round(width), height: Math.round(height) },
                  ...(b.alt ? { altText: { name: 'Picture', description: b.alt, title: b.alt } } : {}),
                }),
              ],
            }),
          )
        }
        flush = true
      } else if (b.type === 'heading') {
        const level = [HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][b.level - 1]
        children.push(new Paragraph({ heading: level, keepNext: true, children: textRuns(b.runs) }))
        flush = true
      } else if (b.type === 'item') {
        children.push(
          new Paragraph({
            ...(b.continued
              ? { indent: { left: HALF_INCH * (b.depth + 1) } }
              : { numbering: { reference: b.ordered ? 'numbers' : 'bullets', level: Math.min(b.depth, LEVELS - 1), instance: b.list } }),
            children: textRuns(b.runs),
          }),
        )
        flush = true
      } else if (b.quote) {
        children.push(new Paragraph({ indent: { left: HALF_INCH * b.quote, right: HALF_INCH }, children: textRuns(b.runs) }))
        flush = true
      } else {
        const body: Omit<IParagraphOptions, 'children'> = {
          ...(justify ? { alignment: AlignmentType.JUSTIFIED } : {}),
          indent: { firstLine: flush ? 0 : indent },
          ...(spaced && !flush ? { spacing: { before: spaced } } : {}),
        }
        if (style && !opened && b.runs.some((r) => r.text.trim())) {
          opened = true
          children.push(...openingParagraphs(b.runs, style, size, body))
        } else {
          children.push(new Paragraph({ ...body, children: textRuns(b.runs) }))
        }
        flush = false
      }
    }
  })

  const running = [m.author.split(/\s+/).pop(), m.title.toUpperCase()].filter(Boolean).join(' / ')
  const lineRule = style ? LineRuleType.AT_LEAST : undefined
  const margin = page
    ? {
        top: Math.round(page.margin.top * INCH),
        bottom: Math.round(page.margin.bottom * INCH),
        left: Math.round(page.margin.side * INCH),
        right: Math.round(page.margin.side * INCH),
        header: Math.round(page.margin.top * INCH * 0.5),
        footer: Math.round(page.margin.bottom * INCH * 0.45),
      }
    : { top: INCH, right: INCH, bottom: INCH, left: INCH, header: HALF_INCH }
  const doc = new Document({
    creator: m.author || 'Story Builder',
    title: m.title,
    ...(justify && style?.hyphenate ? { hyphenation: { autoHyphenation: true } } : {}),
    styles: {
      default: {
        document: { run: { font, size }, paragraph: { spacing: { line, before: 0, after: 0, ...(lineRule ? { lineRule } : {}) } } },
        heading1: { run: { font, size, color: '000000' }, paragraph: { alignment: AlignmentType.CENTER } },
        heading2: { run: { font, size, bold: true, color: '000000' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: line } } },
        heading3: { run: { font, size, bold: true, color: '000000' }, paragraph: { spacing: { before: line } } },
        heading4: { run: { font, size, italics: true, color: '000000' }, paragraph: { spacing: { before: line } } },
      },
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: listLevels(false) },
        { reference: 'numbers', levels: listLevels(true) },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: m.titlePage,
          page: {
            margin,
            ...(page ? { size: { width: Math.round(page.width * INCH), height: Math.round(page.height * INCH) } } : {}),
          },
        },
        ...(style
          ? {
              // The page number at the foot of each page (none on the title page).
              footers: {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { line: 240, lineRule: LineRuleType.AUTO },
                      children: [new TextRun({ children: [PageNumber.CURRENT], size: Math.round(size * 0.75) })],
                    }),
                  ],
                }),
                first: new Footer({ children: [] }),
              },
            }
          : {
              headers: {
                default: new Header({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      spacing: { line: 240 },
                      children: [new TextRun(`${running} / `), new TextRun({ children: [PageNumber.CURRENT] })],
                    }),
                  ],
                }),
                first: new Header({ children: [] }),
              },
            }),
        children,
      },
    ],
  })
  return Packer.toBlob(doc)
}
