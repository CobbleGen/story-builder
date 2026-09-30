import { describe, expect, it } from 'vitest'
import type { RichNode } from '../types'
import { insertItem, listPatch, removeItem, setItem, toggleItem, toItems } from './listLines'
import { countWords, paginate } from './pages'
import { anchorHandle, anchorOfHandle, resolveTextAnchors, textAnchor } from '../lib/anchors'

describe('list text boxes', () => {
  const start = { text: 'Rope\nLantern\nLogbook', checked: [1, 2] }

  it('keeps ticks on their items as items are added and removed', () => {
    const added = insertItem(start, 1, 'Matches')
    expect(added).toEqual({ text: 'Rope\nMatches\nLantern\nLogbook', checked: [2, 3] })
    const removed = removeItem(added, 2)
    expect(removed).toEqual({ text: 'Rope\nMatches\nLogbook', checked: [2] })
    expect(removeItem({ text: 'Only', checked: [0] }, 0)).toEqual({ text: '', checked: [] })
  })

  it('splits pasted lines into items', () => {
    expect(setItem(start, 0, 'Rope\nKnife')).toEqual({ text: 'Rope\nKnife\nLantern\nLogbook', checked: [2, 3] })
    expect(setItem(start, 1, 'Oil lamp')).toEqual({ text: 'Rope\nOil lamp\nLogbook', checked: [1, 2] })
  })

  it('ticks, unticks and turns text into items', () => {
    expect(toggleItem([2], 0)).toEqual([0, 2])
    expect(toggleItem([0, 2], 2)).toEqual([0])
    expect(toItems('First\n\n  \nSecond\n')).toBe('First\nSecond')
    expect(toItems('\n')).toBe('')
  })

  it('turns lists on, switches their style and turns them off', () => {
    expect(listPatch({ text: 'Rope\n\nLantern' }, 'check')).toEqual({ list: 'check', text: 'Rope\nLantern' })
    expect(listPatch({ text: 'Rope\nLantern', list: 'check' }, 'number')).toEqual({ list: 'number' })
    expect(listPatch({ text: 'Rope\nLantern', list: 'number' }, 'number')).toEqual({ list: undefined, checked: undefined })
  })
})

const para = (text: string): RichNode => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const words = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `w${from + i}`).join(' ')
const textOf = (node: RichNode): string =>
  node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(textOf).join('')

describe('chapter pages', () => {
  it('fills pages and carries a long paragraph over', () => {
    const doc: RichNode = { type: 'doc', content: [para(words(60)), para(words(100, 60)), para(words(10, 160))] }
    const pages = paginate(doc, 100)
    expect(pages.map((p) => p.map((b) => countWords(b.node)))).toEqual([[60, 40], [60, 10]])
    expect(pages[1][0].continued).toBe(true)
    expect(textOf(pages[0][1].node).split(' ').at(-1)).toBe('w99')
    expect(textOf(pages[1][0].node).split(' ')[0]).toBe('w100')
  })

  it('starts a paragraph on a new page when little room is left', () => {
    const doc: RichNode = { type: 'doc', content: [para(words(90)), para(words(50, 90))] }
    expect(paginate(doc, 100).map((p) => p.map((b) => countWords(b.node)))).toEqual([[90], [50]])
  })

  it('keeps marks and mentions, and skips blank pages', () => {
    const doc: RichNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: words(30), marks: [{ type: 'italic' }] },
            { type: 'mention', attrs: { id: 'chr_1' } },
            { type: 'text', text: ' ' + words(40, 30) },
          ],
        },
        { type: 'paragraph' },
        { type: 'paragraph' },
      ],
    }
    const pages = paginate(doc, 50)
    expect(pages).toHaveLength(2)
    expect(pages[0][0].node.content?.map((c) => c.type)).toEqual(['text', 'mention', 'text'])
    expect(pages[0][0].node.content?.[0].marks).toEqual([{ type: 'italic' }])
    expect(countWords(pages[0][0].node)).toBe(50)
    expect(countWords(pages[1][0].node)).toBe(21)
    expect(paginate({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual([])
  })
})

describe('the first page', () => {
  it('can hold fewer words than the rest', () => {
    const doc: RichNode = { type: 'doc', content: [para(words(150))] }
    expect(paginate(doc, 100, 60).map((p) => p.map((b) => countWords(b.node)))).toEqual([[60], [90]])
  })
})

describe('anchors for lines', () => {
  it('finds paragraphs again by their opening words, then by position', () => {
    const texts = ['The keeper’s cottage had not changed.', 'She started with the desk.', 'The bottom drawer stuck.']
    const desk = textAnchor('para', 1, texts[1])
    const drawer = textAnchor('para', 2, texts[2])
    // A new paragraph at the top moves everything down one; the lines follow.
    const moved = ['A new opening line.', ...texts]
    expect(resolveTextAnchors([desk, drawer], 'para', moved)).toEqual(new Map([[2, [desk]], [3, [drawer]]]))
    // Rewritten from the start: found by where it was.
    const rewritten = [texts[0], 'At first she ignored the desk.', texts[2]]
    expect(resolveTextAnchors([desk], 'para', rewritten)).toEqual(new Map([[1, [desk]]]))
    // Gone altogether (the text got shorter): not found.
    expect(resolveTextAnchors([drawer], 'para', ['Something else entirely.'])).toEqual(new Map())
    // Only the asked-for kind.
    expect(resolveTextAnchors([textAnchor('item', 0, 'Rope')], 'para', ['Rope'])).toEqual(new Map())
  })

  it('names both sides of an anchored row', () => {
    expect(anchorOfHandle(anchorHandle('beat:beat_1', 'l'))).toBe('beat:beat_1')
    expect(anchorOfHandle(anchorHandle('para:3:abc', 'r'))).toBe('para:3:abc')
    expect(anchorOfHandle('top')).toBeUndefined()
    expect(anchorOfHandle(null)).toBeUndefined()
  })
})

describe('progress', () => {
  it('counts recent days, streaks and totals', async () => {
    const { daysBefore, recentDays, writingStreak, totalWords, progressTo } = await import('../lib/progress')
    expect(daysBefore('2026-03-01', 1)).toBe('2026-02-28')
    expect(daysBefore('2026-01-01', 1)).toBe('2025-12-31')
    const log = { '2026-09-28': 300, '2026-09-29': 120, '2026-09-30': 0, '2026-10-01': 50 }
    expect(recentDays(log, '2026-10-01', 3)).toEqual([
      { day: '2026-09-29', words: 120 },
      { day: '2026-09-30', words: 0 },
      { day: '2026-10-01', words: 50 },
    ])
    expect(writingStreak(log, '2026-10-01')).toBe(1)
    expect(writingStreak({ '2026-09-29': 10, '2026-09-30': 20 }, '2026-10-01')).toBe(2)
    expect(writingStreak({ '2026-09-29': 600, '2026-09-30': 200 }, '2026-10-01', 500)).toBe(0)
    expect(writingStreak({ '2026-09-29': 600, '2026-09-30': 700 }, '2026-10-01', 500)).toBe(2)
    const doc = { type: 'doc' }
    expect(totalWords({ a: { doc, words: 10, updatedAt: 0 }, b: { doc, words: 5, updatedAt: 0 } })).toBe(15)
    expect(progressTo(50, 200)).toBe(0.25)
    expect(progressTo(500, 200)).toBe(1)
    expect(progressTo(5)).toBeNull()
  })
})
