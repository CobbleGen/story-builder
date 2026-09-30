import {
  AlignmentType,
  Document,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  type ILevelsOptions,
} from 'docx'
import { SCENE_BREAK, aboutWords, type Manuscript, type Run } from './manuscript'

// The manuscript as a Word document, in the usual manuscript style: 12 point
// Times New Roman, double spaced, one-inch margins, paragraphs indented half
// an inch (except after a heading or scene break), each chapter on a new
// page with its heading a third of the way down, and the title and page
// number at the top right. This module is loaded only when exporting.

const FONT = 'Times New Roman'
const INCH = 1440
const HALF_INCH = 720
const DOUBLE = 480

function textRuns(runs: Run[]): TextRun[] {
  const out: TextRun[] = []
  for (const r of runs) {
    r.text.split('\n').forEach((line, i) => {
      out.push(
        new TextRun({
          text: line,
          ...(i > 0 ? { break: 1 } : {}),
          ...(r.bold ? { bold: true } : {}),
          ...(r.italic ? { italics: true } : {}),
          ...(r.underline ? { underline: {} } : {}),
          ...(r.strike ? { strike: true } : {}),
        }),
      )
    })
  }
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

export async function manuscriptDocx(m: Manuscript): Promise<Blob> {
  const children: Paragraph[] = []

  if (m.titlePage) {
    children.push(
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: INCH * 3, line: 360 }, children: [new TextRun({ text: m.title, size: 40 })] }),
    )
    if (m.author) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 }, children: [new TextRun(`by ${m.author}`)] }))
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 720 }, children: [new TextRun({ text: aboutWords(m.words), size: 22 })] }))
  }

  m.chapters.forEach((c, i) => {
    const heading: TextRun[] = []
    if (c.label) heading.push(new TextRun({ text: c.label, allCaps: true, size: 24 }))
    if (c.title) heading.push(new TextRun({ text: c.title, size: 32, ...(c.label ? { break: 1 } : {}) }))
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: i > 0 || m.titlePage,
        alignment: AlignmentType.CENTER,
        spacing: { before: INCH * 2, after: DOUBLE, line: 360 },
        keepNext: true,
        children: heading,
      }),
    )
    let flush = true
    for (const b of c.blocks) {
      if (b.type === 'break') {
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(SCENE_BREAK)] }))
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
        children.push(new Paragraph({ indent: { firstLine: flush ? 0 : HALF_INCH }, children: textRuns(b.runs) }))
        flush = false
      }
    }
  })

  const running = [m.author.split(/\s+/).pop(), m.title.toUpperCase()].filter(Boolean).join(' / ')
  const doc = new Document({
    creator: m.author || 'Story Builder',
    title: m.title,
    styles: {
      default: {
        document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: DOUBLE, before: 0, after: 0 } } },
        heading1: { run: { font: FONT, size: 24, color: '000000' }, paragraph: { alignment: AlignmentType.CENTER } },
        heading2: { run: { font: FONT, size: 24, bold: true, color: '000000' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: DOUBLE } } },
        heading3: { run: { font: FONT, size: 24, bold: true, color: '000000' }, paragraph: { spacing: { before: DOUBLE } } },
        heading4: { run: { font: FONT, size: 24, italics: true, color: '000000' }, paragraph: { spacing: { before: DOUBLE } } },
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
          page: { margin: { top: INCH, right: INCH, bottom: INCH, left: INCH, header: HALF_INCH } },
        },
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
        children,
      },
    ],
  })
  return Packer.toBlob(doc)
}
