import type { RichNode } from '../types'
import { wordsInDoc } from './replace'

// Bringing in a manuscript written elsewhere: its text (already in the
// editor's form) tidied, and split into chapters at its headings, or at
// lines like "Chapter 3".

/** Where chapters start: headings of a level, "Chapter 1" lines, or nowhere (one chapter). */
export type SplitMode = 'h1' | 'h2' | 'h3' | 'lines' | 'none'

export interface ImportedChapter {
  title: string
  doc: RichNode
  words: number
  /** What came before the first chapter (often a title page). */
  front: boolean
}

const NUMBER_WORDS =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred'
const NUMBER = `(?:\\d{1,4}|[ivxlcdm]+|(?:${NUMBER_WORDS})(?:[\\s-]+(?:${NUMBER_WORDS}))*)\\b`
/** "Chapter 3", "CHAPTER THREE: The Storm", "Ch. XII". */
const CHAPTER_LINE = new RegExp(`^\\s*(?:chapter|chap\\.|ch\\.)\\s*${NUMBER}`, 'i')
const CHAPTER_PREFIX = new RegExp(`^\\s*(?:chapter|chap\\.|ch\\.)\\s*${NUMBER}\\s*[:.\\-–—]?\\s*`, 'i')
/** Prologue, epilogue and the like start chapters too. */
const NAMED = /^\s*(?:prologue|epilogue|interlude|afterword|foreword|preface)\b/i
/** A line that's only a number: "12", "XII", "3." */
const BARE_NUMBER = /^\s*(?:\d{1,3}|[IVXLC]{1,7})\.?\s*$/
/** "***", "* * *", "#", "~~~", "⁂", "---": a scene break. */
const SCENE_BREAK = /^\s*(?:(?:[*#~•·⁂]\s*){1,5}|[-–—_]{3,})\s*$/

/** A block's text. */
export const blockText = (node: RichNode): string =>
  node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(blockText).join('')

const isTextblock = (n: RichNode) => n.type === 'paragraph' || n.type === 'heading'
const level = (n: RichNode) => (n.type === 'heading' ? Number(n.attrs?.level) || 1 : 0)

/** A short line on its own that starts a chapter: "Chapter 3", "Prologue", "12". */
export function isChapterLine(n: RichNode): boolean {
  if (!isTextblock(n)) return false
  const text = blockText(n).trim()
  return !!text && text.length <= 80 && (CHAPTER_LINE.test(text) || NAMED.test(text) || BARE_NUMBER.test(text))
}

/** A chapter's title from its heading: "Chapter 3: The Logbook" is "The Logbook"; "Chapter Three" or "12", none. */
export function chapterTitle(heading: string): string {
  const text = heading.replace(/\s+/g, ' ').trim()
  if (BARE_NUMBER.test(text)) return ''
  const rest = text.replace(CHAPTER_PREFIX, '')
  if (rest !== text) return rest.trim()
  return text.replace(/^(?:\d{1,3}|[IVXLC]{1,7})\s*[:.\-–—]\s+/, '').trim()
}

/** Plain text as paragraphs: split at blank lines (hard-wrapped lines joined), or a paragraph a line when there are none. */
export function textToHtml(text: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const blankBreaks = (clean.match(/\n[ \t]*\n/g) ?? []).length
  const lines = (clean.match(/\n/g) ?? []).length
  // Mostly blank lines between paragraphs: lines within one are a hard wrap.
  const paragraphs = blankBreaks > 0 && blankBreaks >= lines / 3 ? clean.split(/\n[ \t]*\n+/).map((p) => p.replace(/\s*\n\s*/g, ' ')) : clean.split('\n')
  return paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p)}</p>`)
    .join('\n')
}

/** The text tidied: no empty paragraphs, "***" lines as scene breaks, none doubled or at either end. */
export function tidyBlocks(blocks: RichNode[]): RichNode[] {
  const out: RichNode[] = []
  for (const node of blocks) {
    if (isTextblock(node) && !blockText(node).trim()) continue
    const block = node.type === 'paragraph' && SCENE_BREAK.test(blockText(node)) ? { type: 'horizontalRule' } : node
    if (block.type === 'horizontalRule' && (!out.length || out[out.length - 1].type === 'horizontalRule')) continue
    out.push(block)
  }
  while (out.length && out[out.length - 1].type === 'horizontalRule') out.pop()
  return out
}

/** Where chapters most likely start: the heading level used most (two or more), or "Chapter 1" lines. */
export function detectSplit(doc: RichNode): SplitMode {
  const blocks = doc.content ?? []
  const headings = [1, 2, 3].map((l) => blocks.filter((n) => level(n) === l && blockText(n).trim()).length)
  const most = Math.max(...headings)
  if (most >= 2) return (['h1', 'h2', 'h3'] as const)[headings.indexOf(most)]
  if (blocks.filter(isChapterLine).length >= 2) return 'lines'
  if (headings[0] === 1) return 'h1'
  return 'none'
}

const chapterOf = (title: string, content: RichNode[], front: boolean): ImportedChapter => {
  const doc: RichNode = { type: 'doc', content: tidyBlocks(content) }
  return { title, doc, words: wordsInDoc(doc), front }
}

/**
 * The manuscript as chapters. The heading (or line) that starts a chapter
 * becomes its title rather than staying in its text; headings above that
 * level ("Part Two") go to the start of the chapter after them. What comes
 * before the first is kept apart, as front matter, when there is any.
 */
export function splitChapters(doc: RichNode, mode: SplitMode): ImportedChapter[] {
  const blocks = doc.content ?? []
  const split = mode === 'h1' ? 1 : mode === 'h2' ? 2 : mode === 'h3' ? 3 : 0
  const starts = (n: RichNode) => (split ? level(n) === split && !!blockText(n).trim() : mode === 'lines' ? isChapterLine(n) : false)
  const above = (n: RichNode) => !!split && level(n) > 0 && level(n) < split

  if (mode === 'none') {
    // One chapter, named by a heading it opens with.
    const first = blocks.find((n) => blockText(n).trim())
    const titled = first && level(first) > 0
    return [chapterOf(titled ? chapterTitle(blockText(first)) : '', titled ? blocks.filter((n) => n !== first) : blocks, false)]
  }

  const chapters: ImportedChapter[] = []
  let title = ''
  let front = true
  let content: RichNode[] = []
  let waiting: RichNode[] = []
  const close = () => {
    const chapter = chapterOf(title, content, front)
    if (!front || chapter.doc.content!.length) chapters.push(chapter)
  }
  for (const node of blocks) {
    if (starts(node)) {
      close()
      title = chapterTitle(blockText(node))
      front = false
      content = waiting
      waiting = []
    } else if (above(node) && !front) {
      // ("Part Two" waits for the chapter after it; the book's title, before them all, stays in front.)
      waiting.push(node)
    } else {
      content.push(...waiting, node)
      waiting = []
    }
  }
  content.push(...waiting)
  close()
  return chapters
}

/** A title for a new story made from it: a lone top heading over the chapters, if there is one. */
export function bookTitle(doc: RichNode, mode: SplitMode): string {
  if (mode !== 'h2' && mode !== 'h3') return ''
  const h1s = (doc.content ?? []).filter((n) => level(n) === 1)
  return h1s.length === 1 ? blockText(h1s[0]).trim() : ''
}
