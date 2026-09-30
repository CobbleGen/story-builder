import type { RichNode, StoryData } from '../types'
import { displayName, plainText, type Lookup } from './mentions'
import { MENTION_NODE } from './richText'

// The manuscript as a document to hand to someone: every chapter's text in
// order, with headings, as Word, PDF (by printing), plain text or Markdown.
// Each format is written from the same simple list of paragraphs.

export type ExportFormat = 'docx' | 'pdf' | 'txt' | 'md'
/** How chapter headings read: "Chapter 1" and the title, the title alone, or the number alone. */
export type HeadingStyle = 'number-title' | 'title' | 'number'

export interface ExportOptions {
  format: ExportFormat
  headings: HeadingStyle
  titlePage: boolean
  author: string
  /** Leave out chapters with nothing written yet. */
  skipEmpty: boolean
}

export const DEFAULT_EXPORT: ExportOptions = {
  format: 'docx',
  headings: 'number-title',
  titlePage: true,
  author: '',
  skipEmpty: true,
}

/** A stretch of text in one style; `\n` is a line break. */
export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
}

export type Block =
  | { type: 'paragraph'; runs: Run[]; quote?: number }
  | { type: 'heading'; level: number; runs: Run[] }
  /** A list item, or (continued) a later paragraph of one. `list` tells lists apart. */
  | { type: 'item'; runs: Run[]; ordered: boolean; number: number; depth: number; list: number; continued?: boolean }
  /** A scene break. */
  | { type: 'break' }

export interface ManuscriptChapter {
  /** "Chapter 3", or null when headings show the title alone. */
  label: string | null
  /** The chapter's title, or null when headings show the number alone. */
  title: string | null
  blocks: Block[]
}

export interface Manuscript {
  title: string
  author: string
  /** Words in the chapters included. */
  words: number
  titlePage: boolean
  chapters: ManuscriptChapter[]
}

export const SCENE_BREAK = '*  *  *'

type NameOf = (id: string, label: unknown) => string

function runsOf(node: RichNode, nameOf: NameOf): Run[] {
  const runs: Run[] = []
  for (const child of node.content ?? []) {
    const marks = new Set((child.marks ?? []).map((m) => m.type))
    const style: Omit<Run, 'text'> = {}
    if (marks.has('bold')) style.bold = true
    if (marks.has('italic')) style.italic = true
    if (marks.has('underline')) style.underline = true
    if (marks.has('strike')) style.strike = true
    let text = ''
    if (child.type === 'text') text = child.text ?? ''
    else if (child.type === MENTION_NODE) text = nameOf(String(child.attrs?.id ?? ''), child.attrs?.label)
    else if (child.type === 'hardBreak') text = '\n'
    else if (child.content) {
      runs.push(...runsOf(child, nameOf))
      continue
    }
    if (!text) continue
    const last = runs[runs.length - 1]
    const same = last && !!last.bold === !!style.bold && !!last.italic === !!style.italic && !!last.underline === !!style.underline && !!last.strike === !!style.strike
    if (same) last.text += text
    else runs.push({ text, ...style })
  }
  return runs
}

/** A chapter's text as a flat list of paragraphs, headings, list items and scene breaks. */
export function blocksOf(doc: RichNode, nameOf: NameOf): Block[] {
  const out: Block[] = []
  let lists = 0
  const walk = (nodes: RichNode[], quote: number, depth: number) => {
    for (const node of nodes) {
      switch (node.type) {
        case 'paragraph':
          out.push(quote ? { type: 'paragraph', runs: runsOf(node, nameOf), quote } : { type: 'paragraph', runs: runsOf(node, nameOf) })
          break
        case 'heading':
          out.push({ type: 'heading', level: Math.min(3, Math.max(1, Number(node.attrs?.level) || 1)), runs: runsOf(node, nameOf) })
          break
        case 'horizontalRule':
          out.push({ type: 'break' })
          break
        case 'blockquote':
          walk(node.content ?? [], quote + 1, depth)
          break
        case 'bulletList':
        case 'orderedList': {
          const ordered = node.type === 'orderedList'
          const list = lists++
          let number = ordered ? Math.max(0, Number(node.attrs?.start ?? 1) || 1) : 1
          for (const item of node.content ?? []) {
            let first = true
            for (const child of item.content ?? []) {
              if (child.type === 'paragraph' || child.type === 'heading') {
                out.push({ type: 'item', runs: runsOf(child, nameOf), ordered, number, depth: depth + 1, list, ...(first ? {} : { continued: true }) })
                first = false
              } else {
                walk([child], quote, depth + 1)
              }
            }
            if (first) out.push({ type: 'item', runs: [], ordered, number, depth: depth + 1, list })
            number++
          }
          break
        }
        default:
          if (node.content) walk(node.content, quote, depth)
      }
    }
  }
  walk(doc.content ?? [], 0, -1)
  return out
}

/** The chapters to export, as the options ask. */
export function buildManuscript(data: Pick<StoryData, 'title' | 'chapters' | 'texts'>, lookup: Lookup, options: ExportOptions): Manuscript {
  const nameOf: NameOf = (id, label) => {
    const named = lookup.get(id)
    return named ? displayName(named) : String(label ?? '')
  }
  const chapters: ManuscriptChapter[] = []
  let words = 0
  data.chapters.forEach((c, i) => {
    const text = data.texts[c.id]
    const blocks = text ? blocksOf(text.doc, nameOf) : []
    const empty = !blocks.some((b) => b.type === 'break' || b.runs.some((r) => r.text.trim()))
    if (empty && options.skipEmpty) return
    words += text?.words ?? 0
    const title = plainText(c.title, lookup).trim()
    const label = `Chapter ${i + 1}`
    chapters.push({
      label: options.headings === 'title' && title ? null : label,
      title: options.headings === 'number' ? null : title || null,
      blocks,
    })
  })
  return {
    title: data.title.trim() || 'Untitled story',
    author: options.author.trim(),
    words,
    titlePage: options.titlePage,
    chapters,
  }
}

/** A chapter heading on one line: "Chapter 3: The Logbook". */
export const headingLine = (c: ManuscriptChapter) => [c.label, c.title].filter(Boolean).join(': ')

/** "about 12,300 words", rounded the way manuscripts give it. */
export function aboutWords(words: number): string {
  if (words < 1000) return `${words.toLocaleString('en')} word${words === 1 ? '' : 's'}`
  return `about ${(Math.round(words / 100) * 100).toLocaleString('en')} words`
}

const runText = (runs: Run[]) => runs.map((r) => r.text).join('')

// ---------- Plain text ----------

export function toPlainText(m: Manuscript): string {
  const parts: string[] = []
  if (m.titlePage) {
    parts.push([m.title, m.author ? `by ${m.author}` : '', aboutWords(m.words)].filter(Boolean).join('\n\n'))
  }
  for (const c of m.chapters) {
    const lines: string[] = [headingLine(c)]
    for (const b of c.blocks) {
      if (b.type === 'break') lines.push(SCENE_BREAK)
      else if (b.type === 'item') {
        const pad = '    '.repeat(b.depth)
        const text = runText(b.runs).replace(/\n/g, `\n${pad}    `)
        lines.push(b.continued ? `${pad}    ${text}` : `${pad}${b.ordered ? `${b.number}.` : '-'} ${text}`)
      } else if (b.type === 'paragraph' && b.quote) {
        lines.push(runText(b.runs).replace(/^/gm, '    '))
      } else {
        lines.push(runText(b.runs))
      }
    }
    parts.push(lines.join('\n\n'))
  }
  return `${parts.join('\n\n\n')}\n`
}

// ---------- Markdown ----------

/** Characters that Markdown would read as formatting. */
function escapeMd(text: string): string {
  return text.replace(/([\\`*_~[\]<>])/g, '\\$1')
}

/** Runs as Markdown; spaces stay outside the markers, which can't start or end with one. */
function mdRuns(runs: Run[]): string {
  return runs
    .map((r) => {
      const lead = r.text.match(/^\s*/)?.[0] ?? ''
      const trail = r.text.slice(lead.length).match(/\s*$/)?.[0] ?? ''
      let core = escapeMd(r.text.slice(lead.length, r.text.length - trail.length))
      if (!core) return r.text
      if (r.strike) core = `~~${core}~~`
      if (r.italic) core = `*${core}*`
      if (r.bold) core = `**${core}**`
      if (r.underline) core = `<u>${core}</u>`
      return lead + core + trail
    })
    .join('')
    .replace(/\n/g, '\\\n')
}

/** A paragraph that starts like a heading, quote or list item would turn into one. */
const guardStart = (line: string) => line.replace(/^(\s*)([#>+-]|\d+\.)(?=\s|$)/, (_, space: string, mark: string) => `${space}${mark.replace(/([#>+.-])$/, '\\$1')}`)

export function toMarkdown(m: Manuscript): string {
  const parts: string[] = []
  const chapterLevel = m.titlePage ? 2 : 1
  if (m.titlePage) {
    parts.push([`# ${escapeMd(m.title)}`, m.author ? `*by ${escapeMd(m.author)}*` : '', aboutWords(m.words)].filter(Boolean).join('\n\n'))
  }
  for (const c of m.chapters) {
    const out: string[] = [`${'#'.repeat(chapterLevel)} ${escapeMd(headingLine(c))}`]
    let prevItem = false
    for (const b of c.blocks) {
      let text: string
      if (b.type === 'break') text = '* * *'
      else if (b.type === 'heading') text = `${'#'.repeat(Math.min(6, chapterLevel + b.level))} ${mdRuns(b.runs)}`
      else if (b.type === 'item') {
        const pad = '    '.repeat(b.depth)
        const body = mdRuns(b.runs).replace(/\n/g, `\n${pad}    `)
        text = b.continued ? `\n${pad}    ${body}` : `${pad}${b.ordered ? `${b.number}.` : '-'} ${body}`
      } else {
        const body = guardStart(mdRuns(b.runs))
        text = b.quote ? body.replace(/^/gm, '> '.repeat(b.quote)) : body
      }
      // Items of one list sit on consecutive lines; everything else has a blank line between.
      const isItem = b.type === 'item'
      if (isItem && prevItem) out[out.length - 1] += `\n${text}`
      else out.push(text)
      prevItem = isItem
    }
    parts.push(out.join('\n\n'))
  }
  return `${parts.join('\n\n')}\n`
}

// ---------- Print (for PDF) ----------

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function htmlRuns(runs: Run[]): string {
  return runs
    .map((r) => {
      let html = escapeHtml(r.text).replace(/\n/g, '<br>')
      if (r.strike) html = `<s>${html}</s>`
      if (r.underline) html = `<u>${html}</u>`
      if (r.italic) html = `<em>${html}</em>`
      if (r.bold) html = `<strong>${html}</strong>`
      return html
    })
    .join('')
}

/** A standalone page laid out like a manuscript, for printing or saving as PDF. */
export function toPrintHtml(m: Manuscript): string {
  const body: string[] = []
  if (m.titlePage) {
    body.push(
      `<section class="title-page"><h1>${escapeHtml(m.title)}</h1>${m.author ? `<p class="by">by ${escapeHtml(m.author)}</p>` : ''}<p class="count">${escapeHtml(aboutWords(m.words))}</p></section>`,
    )
  }
  m.chapters.forEach((c, i) => {
    const head = [c.label ? `<span class="label">${escapeHtml(c.label)}</span>` : '', c.title ? `<span class="name">${escapeHtml(c.title)}</span>` : '']
      .filter(Boolean)
      .join('')
    const html: string[] = [`<h2 class="chapter${i === 0 && !m.titlePage ? ' first' : ''}">${head}</h2>`]
    let flush = true
    for (const b of c.blocks) {
      if (b.type === 'break') {
        html.push(`<p class="scene">${SCENE_BREAK}</p>`)
        flush = true
        continue
      }
      if (b.type === 'heading') {
        html.push(`<h${b.level + 2}>${htmlRuns(b.runs)}</h${b.level + 2}>`)
        flush = true
        continue
      }
      if (b.type === 'item') {
        const marker = b.continued ? '' : `<span class="marker">${b.ordered ? `${b.number}.` : '•'}</span>`
        html.push(`<p class="item" style="margin-left:${0.5 + b.depth * 0.4}in">${marker}${htmlRuns(b.runs) || '&nbsp;'}</p>`)
        flush = true
        continue
      }
      const classes = [b.quote ? 'quote' : '', flush ? 'flush' : ''].filter(Boolean).join(' ')
      html.push(`<p${classes ? ` class="${classes}"` : ''}>${htmlRuns(b.runs) || '&nbsp;'}</p>`)
      flush = !!b.quote
    }
    body.push(`<section class="chapter-text">${html.join('\n')}</section>`)
  })
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(m.title)}</title>
<style>
@page { margin: 1in; }
html { background: #fff; }
body { margin: 0; color: #000; font: 12pt/2 'Times New Roman', Times, 'Source Serif 4', Georgia, serif; }
p { margin: 0; text-indent: 0.5in; orphans: 2; widows: 2; }
p.flush, p.quote, p.item, p.scene { text-indent: 0; }
p.quote { margin: 0 0.5in; }
p.item { padding-left: 0.3in; text-indent: -0.3in; }
p.item .marker { display: inline-block; width: 0.3in; text-indent: 0; }
p.scene { text-align: center; margin: 0.5em 0; }
h2.chapter { break-before: page; margin: 1.6in 0 0.6in; text-align: center; font-weight: normal; line-height: 1.4; }
h2.chapter.first { break-before: auto; }
h2.chapter .label { display: block; font-size: 12pt; letter-spacing: 0.08em; text-transform: uppercase; }
h2.chapter .name { display: block; margin-top: 0.4em; font-size: 16pt; }
h3, h4, h5 { margin: 1em 0 0; font-size: 12pt; line-height: 2; break-after: avoid; }
h3 { text-align: center; }
.title-page { display: flex; flex-direction: column; justify-content: center; height: 8.5in; text-align: center; break-after: page; }
.title-page h1 { margin: 0; font-size: 20pt; font-weight: normal; line-height: 1.3; }
.title-page .by { margin-top: 0.6em; text-indent: 0; }
.title-page .count { margin-top: 2em; text-indent: 0; font-size: 11pt; }
@media screen { body { max-width: 6.5in; margin: 0.5in auto; } }
</style>
</head>
<body>
${body.join('\n')}
</body>
</html>`
}
