import { describe, expect, it } from 'vitest'
import type { RichNode } from '../types'
import { bookTitle, chapterTitle, detectSplit, isChapterLine, splitChapters, textToHtml, tidyBlocks } from './manuscriptImport'
import { emptyStory, importChapters, addChapter } from '../store/storyOps'
import { restore } from '../store/history'

const t = (text: string): RichNode => ({ type: 'text', text })
const p = (text: string): RichNode => (text ? { type: 'paragraph', content: [t(text)] } : { type: 'paragraph' })
const h = (level: number, text: string): RichNode => ({ type: 'heading', attrs: { level }, content: [t(text)] })
const doc = (...content: RichNode[]): RichNode => ({ type: 'doc', content })
const titles = (chapters: { title: string }[]) => chapters.map((c) => c.title)

describe('importing a manuscript', () => {
  it('reads plain text as paragraphs, hard wraps joined', () => {
    expect(textToHtml('One line.\nAnother line.\r\nA third.')).toBe('<p>One line.</p>\n<p>Another line.</p>\n<p>A third.</p>')
    expect(textToHtml('﻿The sea was\nquiet that night.\n\nThen the <bell> rang.\n\n\n')).toBe('<p>The sea was quiet that night.</p>\n<p>Then the &lt;bell&gt; rang.</p>')
  })

  it('names chapters from their headings', () => {
    expect(chapterTitle('Chapter 3: The Logbook')).toBe('The Logbook')
    expect(chapterTitle('CHAPTER SEVENTEEN — Low Tide')).toBe('Low Tide')
    expect(chapterTitle('Chapter Twenty-One')).toBe('')
    expect(chapterTitle('Ch. XII. Fog')).toBe('Fog')
    expect(chapterTitle('12')).toBe('')
    expect(chapterTitle('3. The Bell')).toBe('The Bell')
    expect(chapterTitle('Prologue')).toBe('Prologue')
    expect(chapterTitle('The Storm')).toBe('The Storm')
    expect(['Chapter 1', 'CHAPTER ONE', 'Prologue', 'XIV', '7.'].map((s) => isChapterLine(p(s)))).toEqual([true, true, true, true, true])
    expect(['Chapters of my life were long and full of the sea', 'One more thing.', ''].map((s) => isChapterLine(p(s)))).toEqual([false, false, false])
  })

  it('tidies: no empty paragraphs, "***" as a scene break, none doubled or at the ends', () => {
    const tidy = tidyBlocks([p(''), p('* * *'), p('Text.'), p('   '), p('***'), p('#'), p('More.'), p('---'), p('')])
    expect(tidy).toEqual([p('Text.'), { type: 'horizontalRule' }, p('More.')])
  })

  it('finds where chapters start, and splits there', () => {
    // A book title over chapter subheadings: the subheadings
    const book = doc(h(1, 'The Lighthouse'), p('by Ann Lee'), h(2, 'Chapter 1: The Storm'), p('Rain.'), p(''), h(2, 'Chapter 2'), p('Wind and more wind.'), h(3, 'A scene heading'), p('Still wind.'))
    expect(detectSplit(book)).toBe('h2')
    expect(bookTitle(book, 'h2')).toBe('The Lighthouse')
    const chapters = splitChapters(book, 'h2')
    expect(titles(chapters)).toEqual(['', 'The Storm', ''])
    expect(chapters[0]).toMatchObject({ front: true, words: 5 })
    expect(chapters[1]).toMatchObject({ front: false, words: 1, doc: doc(p('Rain.')) })
    // Lower headings stay in the text
    expect(chapters[2].doc.content!.map((n) => n.type)).toEqual(['paragraph', 'heading', 'paragraph'])
    expect(chapters[2].words).toBe(9)
    // Parts over chapters: each part's heading goes to the start of the chapter after it
    const parts = doc(h(1, 'Part One'), h(2, 'Chapter 1'), p('A.'), h(1, 'Part Two'), h(2, 'Chapter 2'), p('B.'), h(2, 'Chapter 3'), p('C.'))
    expect(detectSplit(parts)).toBe('h2')
    const split = splitChapters(parts, 'h2')
    expect(split.map((c) => c.doc.content!.map((n) => (n.type === 'heading' ? `#${n.content![0].text}` : n.content![0].text)))).toEqual([
      ['#Part One'],
      ['A.'],
      ['#Part Two', 'B.'],
      ['C.'],
    ])
    // No headings: "Chapter" lines (and a prologue) start chapters
    const plain = doc(p('My Novel'), p('Prologue'), p('Before.'), p('CHAPTER ONE'), p('First.'), p('Chapter Two: Fog'), p('Second.'))
    expect(detectSplit(plain)).toBe('lines')
    expect(titles(splitChapters(plain, 'lines'))).toEqual(['', 'Prologue', '', 'Fog'])
    // Nothing to split at: one chapter, named by a heading it opens with
    expect(detectSplit(doc(p('Just text.'), p('More.')))).toBe('none')
    expect(splitChapters(doc(h(1, 'The Storm'), p('Rain.')), 'none')).toEqual([{ title: 'The Storm', doc: doc(p('Rain.')), words: 1, front: false }])
    expect(detectSplit(doc(h(1, 'Only one'), p('Text.')))).toBe('h1')
    // Nothing before the first chapter: no front matter
    expect(splitChapters(doc(h(1, 'One'), p('A.'), h(1, 'Two'), p('B.')), 'h1').map((c) => c.front)).toEqual([false, false])
  })

  it('adds the chapters to a story, as one change undo takes away', () => {
    const [data] = addChapter(emptyStory(), { title: 'Mine' })
    const [next, ids] = importChapters(data, [
      { title: '  The   Storm ', doc: doc(p('Rain.')), words: 1 },
      { title: '', doc: doc(), words: 0 },
    ])
    expect(next.chapters.map((c) => c.title)).toEqual(['Mine', 'The Storm', ''])
    expect(next.texts[ids[0]]).toMatchObject({ doc: doc(p('Rain.')), words: 1 })
    expect(next.texts).not.toHaveProperty(ids[1])
    // Not words written today
    expect([next.wordLog, next.wordCuts]).toEqual([{}, {}])
    // Or before a chapter
    expect(importChapters(data, [{ title: 'First', doc: doc(p('x')), words: 1 }], 0)[0].chapters.map((c) => c.title)).toEqual(['First', 'Mine'])
    // Undone: gone, text and all
    const back = restore(data, next, Date.now() + 10)
    expect(back.chapters).toHaveLength(1)
    expect(Object.keys(back.texts)).toEqual([])
  })
})
