import { describe, expect, it } from 'vitest'
import type { RichNode, StoryData } from '../types'
import { buildSampleStory } from '../store/sampleStory'
import {
  addArc,
  addBeat,
  addChapter,
  addCharacter,
  addElement,
  addMapNode,
  emptyStory,
  mentionables,
  setChapterText,
} from '../store/storyOps'
import { lookupOf, mentionToken } from './mentions'
import { MAX_TEXT_HITS, buildIndex, fold, parseQuery, search, snippetOf, textBlocks, type Marked } from './search'

const find = (data: StoryData, query: string) => search(buildIndex(data, lookupOf(mentionables(data))), query)
const marked = (m: Marked) => m.marks.map(([s, e]) => m.text.slice(s, e))

describe('search', () => {
  it('folds case and accents without moving anything', () => {
    for (const text of ['Café au lait', 'İstanbul', 'Zoë’s façade', 'ẞ straße', 'emoji 🙂 here']) {
      expect(fold(text)).toHaveLength(text.length)
    }
    expect(fold('Café Zoë')).toBe('cafe zoe')
    expect(fold('İstanbul')).toBe('istanbul')
  })

  it('reads a query as words, keeping quoted words together', () => {
    expect(parseQuery('  Mara  "green   cover" ')).toEqual(['mara', 'green cover'])
    // "the" is part of "theo", so it adds nothing.
    expect(parseQuery('the Theo')).toEqual(['theo'])
    expect(parseQuery('   ')).toEqual([])
  })

  it('finds things of every kind, titles first', () => {
    const data = buildSampleStory()
    const groups = find(data, 'logbook')
    // Names that match come before things that only mention it.
    expect(groups.map((g) => g.kind)).toEqual(['chapter', 'element', 'beat', 'text'])
    const chapter = groups[0].hits[0]
    expect(chapter.title.text).toBe('The Logbook')
    expect(marked(chapter.title)).toEqual(['Logbook'])
    // The beat mentions the logbook by name: mentions are searched as they read.
    const beat = groups[2].hits[0]
    expect(beat.snippet?.text).toBe('Mara finds the Green Logbook under a false bottom.')
    expect(marked(beat.snippet!)).toEqual(['Logbook'])
    expect(groups.find((g) => g.kind === 'element')!.hits.map((h) => h.title.text)).toEqual(['Green Logbook'])
  })

  it('needs every word, anywhere in the item', () => {
    const data = buildSampleStory()
    const beats = find(data, 'harrow decommission').find((g) => g.kind === 'beat')
    expect(beats?.hits.map((h) => h.title.text)).toEqual(['Emergency council meeting'])
    expect(find(data, 'harrow zebra')).toEqual([])
    // Attributes are searched, and say which one matched.
    const people = find(data, 'glasgow').find((g) => g.kind === 'character')!
    expect(people.hits[0]).toMatchObject({ id: data.characters[0].id, snippetLabel: 'Occupation' })
  })

  it('finds a paragraph of the manuscript and says which one', () => {
    const data = buildSampleStory()
    const text = find(data, '"green cover"').find((g) => g.kind === 'text')!
    expect(text.hits).toHaveLength(1)
    const hit = text.hits[0]
    const ch3 = data.chapters[2]
    expect(hit.id).toBe(ch3.id)
    expect(hit.title.text).toBe('Chapter 3: The Logbook')
    const blocks = textBlocks(data.texts[ch3.id].doc, lookupOf(mentionables(data)))
    expect(fold(blocks[hit.block!])).toContain('green cover')
    expect(marked(hit.snippet!)).toEqual(['green cover'])
    // Mentions in the text read as names.
    expect(find(data, 'dent where mara').find((g) => g.kind === 'text')?.hits).toHaveLength(1)
  })

  it('finds accented names without the accents, and notes on any map', () => {
    let data = emptyStory()
    let zoe: string
    ;[data, zoe] = addCharacter(data, { name: 'Zoë', color: '#0a0' })
    ;[data] = addElement(data, { name: 'Café Rouge', kind: 'place', color: '#f00' })
    ;[data] = addMapNode(data, {
      kind: 'note', x: 0, y: 0, width: 200, height: 100, color: 'yellow', text: `Does ${mentionToken(zoe)} know\nabout the café?`,
    })
    const groups = find(data, 'zoe cafe')
    expect(groups.map((g) => g.kind)).toEqual(['note'])
    expect(groups[0].hits[0]).toMatchObject({ mapId: data.mindMaps[0].id })
    expect(groups[0].hits[0].snippet?.text).toBe('Does Zoë know about the café?')
    expect(marked(groups[0].hits[0].snippet!)).toEqual(['Zoë', 'café'])
    expect(find(data, 'cafe').map((g) => g.kind)).toEqual(['element', 'note'])
  })

  it('cuts long text down around the first match', () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`)
    words[50] = 'lighthouse'
    const text = words.join(' ')
    const snip = snippetOf({ text, folded: fold(text) }, ['lighthouse'])
    expect(snip.text.startsWith('…')).toBe(true)
    expect(snip.text.endsWith('…')).toBe(true)
    expect(snip.text.length).toBeLessThanOrEqual(155)
    expect(marked(snip)).toEqual(['lighthouse'])
  })

  it('stops listing manuscript paragraphs after a few hundred', () => {
    let data = emptyStory()
    let ch: string, arc: string
    ;[data, ch] = addChapter(data, { title: 'Long' })
    ;[data, arc] = addArc(data, { name: 'A', color: '#000' })
    ;[data] = addBeat(data, { arcId: arc, title: 'the end' })
    const para = (i: number): RichNode => ({ type: 'paragraph', content: [{ type: 'text', text: `The end ${i}` }] })
    const doc: RichNode = { type: 'doc', content: Array.from({ length: MAX_TEXT_HITS + 50 }, (_, i) => para(i)) }
    data = setChapterText(data, ch, { doc, words: 1, updatedAt: 1 }, null)
    const groups = find(data, 'end')
    expect(groups.find((g) => g.kind === 'text')?.hits).toHaveLength(MAX_TEXT_HITS)
    expect(groups.find((g) => g.kind === 'beat')?.hits).toHaveLength(1)
  })
})

describe('search ranking', () => {
  it('puts the group with the closest match first', () => {
    const data = buildSampleStory()
    // The place is called exactly that; a beat only mentions it.
    expect(find(data, 'sea caves').map((g) => g.kind)).toEqual(['element', 'beat'])
    expect(find(data, 'mara')[0].kind).toBe('character')
    // Equally close matches keep the usual order.
    expect(find(data, 'logbook').map((g) => g.kind)).toEqual(['chapter', 'element', 'beat', 'text'])
    expect(find(data, 'theo').map((g) => g.kind)).toEqual(['character', 'beat', 'arc', 'note'])
  })
})
