import { describe, expect, it } from 'vitest'
import type { RichNode, StoryData } from '../types'
import { buildSampleStory } from '../store/sampleStory'
import { addMapEdge, addMapNode, placeOutlineStep, setArcOutline, setChapterText, updateMapEdge } from '../store/storyOps'
import { NotFound, storyOf } from './story'
import { readChapter, readManuscript } from './chapters'
import { mindMaps, colourName } from './maps'
import { findChapter } from './story'
import { overview } from '.'
import { outline } from './outline'

const para = (text: string): RichNode => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** The example story with chapter 1 written out long: `paragraphs` paragraphs of about 1,000 characters. */
function withLongChapter(paragraphs: number): StoryData {
  const data = buildSampleStory()
  const ch1 = data.chapters[0].id
  const doc: RichNode = { type: 'doc', content: Array.from({ length: paragraphs }, (_, i) => para(`Paragraph ${i + 1}. ${'Rain on the glass. '.repeat(50)}`)) }
  return setChapterText(data, ch1, { doc, words: paragraphs * 200, updatedAt: 0 }, null)
}

describe('reading chapters', () => {
  it('finds chapters by number, title or heading', () => {
    const story = storyOf(buildSampleStory())
    expect(findChapter(story, 3)?.title).toBe('The Logbook')
    expect(findChapter(story, 'chapter 2')?.title).toBe('Wreckage')
    expect(findChapter(story, 'Chapter 4: Low Tide')?.title).toBe('Low Tide')
    expect(findChapter(story, 'logbook')?.title).toBe('The Logbook')
    expect(findChapter(story, 'ch. 1')?.title).toBe('The Storm')
    expect(findChapter(story, '12')).toBeUndefined()
  })

  it('gives a long chapter in parts, the plan only with the first', () => {
    const story = storyOf(withLongChapter(100))
    const first = readChapter(story, 1)
    expect(first).toMatch(/## Planned beats/)
    expect(first).toMatch(/## Text \(part 1 of 3; read_chapter with part 2 for more\)/)
    expect(first).toMatch(/Paragraph 1\./)
    const second = readChapter(story, 1, 2)
    expect(second).not.toMatch(/## Planned beats/)
    expect(second).toMatch(/## Text \(part 2 of 3; read_chapter with part 3 for more\)/)
    // Every paragraph is in exactly one part.
    const all = [1, 2, 3].map((p) => readChapter(story, 1, p)).join('\n')
    expect(all.match(/Paragraph \d+\./g)).toHaveLength(100)
    expect(() => readChapter(story, 1, 4)).toThrow(NotFound)
  })

  it('reads the manuscript as far as fits, then says where to carry on', () => {
    const story = storyOf(withLongChapter(30))
    // Chapter 1 (some 29,000 characters) fits; chapter 3 would go over a 30,000 budget with it.
    const start = readManuscript(story, 1, undefined, 30_000)
    expect(start).toMatch(/^# The Lighthouse at Gull Point: the manuscript, chapters 1–2 of 4/)
    expect(start).toMatch(/To carry on: read_manuscript with from_chapter 3\./)
    expect(readManuscript(story, 3, undefined, 30_000)).toMatch(/chapters 3–4 of 4[\s\S]*The keeper’s cottage/)
    // A chapter longer than the budget on its own comes in parts.
    expect(readManuscript(storyOf(withLongChapter(100)), 1, 2, 40_000)).toMatch(/Chapter 1: The Storm goes on: read_chapter 1 with part 2, then read_manuscript with from_chapter 2\./)
  })
})

describe('mind maps', () => {
  it('nests what’s on groups, and says where lines attach inside cards', () => {
    let data = buildSampleStory()
    const mara = data.characters.find((c) => c.name === 'Mara')!
    const fears = mara.attributes.find((a) => a.label === 'Fears')!
    const place = (node: Parameters<typeof addMapNode>[1]) => {
      let id: string | null
      ;[data, id] = addMapNode(data, node)
      return id!
    }
    const group = place({ kind: 'container', x: 900, y: 900, width: 400, height: 300, title: 'Open questions', color: '#f4b4b4', layout: 'vertical' })
    const note = place({ kind: 'note', x: 10, y: 40, width: 200, height: 120, text: 'Does Harrow know?\nWho paid Elias?', color: '#fbe7a1', list: 'check', checked: [1], containerId: group })
    const maraCard = data.mindMaps[0].nodes.find((n) => n.kind === 'character' && n.refId === mara.id)!.id
    let edge: string | null
    ;[data, edge] = addMapEdge(data, note, maraCard, { target: `attr:${fears.id}` })
    data = updateMapEdge(data, edge!, { label: 'ask her', arrow: true })
    const text = mindMaps(storyOf(data))
    expect(text).toMatch(/- group “Open questions”, stacked in a column, pale red, holding:\n {2}- yellow note: \[ \] Does Harrow know\?\n {4}\[x\] Who paid Elias\?/)
    expect(text).toMatch(/- note “Does Harrow know\? Who paid Elias\?” → Mara \(character\), at its “Fears” detail: “ask her”/)
  })

  it('names colours in words', () => {
    expect(colourName('#fbe7a1')).toBe('yellow')
    expect(colourName('#2f6fd6')).toBe('blue')
    expect(colourName('#b9e4b0')).toBe('pale green')
    expect(colourName('#eef3ee')).toBe('white')
    expect(colourName('#777777')).toBe('grey')
    expect(colourName(undefined)).toBeNull()
  })
})

describe('the overview', () => {
  it('starts with the story in numbers and tells backstory from the book', () => {
    const text = overview(storyOf(buildSampleStory()))
    expect(text).toMatch(/^# The Lighthouse at Gull Point\n\n4 chapters · 274 words written in the manuscript\n14 beats planned \(2 ticked off as written\) in 4 arcs/)
    expect(text).toMatch(/3\. The Logbook — status: draft · 274 words \(3,000-word target\) · point of view: Mara/)
    expect(text).toMatch(/Backstory, before the book begins: Elias’s first run\./)
    expect(text).toMatch(/Who knows what — 1 text box, 4 characters, 1 place or thing, 1 arc, 1 chapter, 1 note; 6 lines/)
  })
})

describe('arc outlines in the plan', () => {
  it('names the structure an arc follows, the step each beat stands for, and the steps on none', () => {
    let data = buildSampleStory()
    const arc = data.arcs[0]
    data = setArcOutline(data, arc.id, 'kishotenketsu')
    data = placeOutlineStep(data, arc.id, 'ketsu', null)
    const text = outline(storyOf(data))
    expect(text).toMatch(/### The missing ship\nWhat really happened[^\n]*\nCharacters in it: Mara\nOutline: Kishōtenketsu, laid over this arc by the writer/)
    expect(text).toMatch(/1\. The Aurelia signals from the reef — chapter 1 — outline: Ki: introduction/)
    expect(text).toMatch(/Steps of the outline on no beat yet: Ketsu: reconciliation/)
  })
})
