import { describe, expect, it } from 'vitest'
import type { RichNode } from '../types'
import { insertItem, listPatch, removeItem, setItem, toggleItem, toItems } from './listLines'
import { countWords, paginate } from './pages'

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
