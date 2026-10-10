import { describe, expect, it } from 'vitest'
import type { StoryData } from '../types'
import type { RichNode } from '../types'
import {
  addMapEdge,
  addMapNode,
  moveMapNodes,
  removeMapNodes,
  addAttribute,
  setChapterText,
  addCharacter,
  deleteAttribute,
  deleteCharacter,
  moveAttribute,
  setArcCharacter,
  updateAttribute,
  updateChapter,
  updateCharacter,
  addArc,
  addBeat,
  addChapter,
  applyChapterLayout,
  deleteArc,
  deleteBeat,
  deleteChapter,
  moveChapter,
  logOutline,
  normalizeStory,
  emptyStory,
  addMindMap,
  renameMindMap,
  deleteMindMap,
  updateMapNode,
  setGoals,
  placeBeat,
  setBeatArc,
  addElement,
  updateElement,
  deleteElement,
  linkMentions,
  mentionables,
  addBeatInReading,
  addBeatInStory,
  moveInReading,
  moveInStory,
  moveBeatsToArc,
  moveArc,
  moveBookMarker,
  moveChapterEdge,
  insertChapter,
  matchStoryOrder,
  beatsInBook,
  BOOK_START,
  BOOK_END,
  readingOrder,
  readingSections,
  resetTimeline,
  storyColumns,
  storyOrder,
  storyStops,
  updateBeat,
  setPortrait,
  pasteMapItems,
  dropMapNodes,
  setContainerLayout,
  parentOf,
} from './storyOps'
import { timeJumps } from '../lib/timeline'
import { outlineWords, wordsIn } from '../lib/progress'
import { buildSampleStory } from './sampleStory'
import { lookupOf, mentionToken, toDisplay } from '../lib/mentions'
import { mentionPlaces, placeCount } from '../lib/mentionedIn'

function setup() {
  let data: StoryData = emptyStory('Test')
  let ch1: string, ch2: string, ch3: string, main: string, love: string
  ;[data, ch1] = addChapter(data, { title: 'One' })
  ;[data, ch2] = addChapter(data, { title: 'Two' })
  ;[data, ch3] = addChapter(data, { title: 'Three' })
  ;[data, main] = addArc(data, { name: 'Main', color: '#f00' })
  ;[data, love] = addArc(data, { name: 'Love', color: '#0f0' })
  return { data, ch1, ch2, ch3, main, love }
}

/** Every beat is in its arc list once and, if placed, in its chapter list once. */
function expectConsistent(data: StoryData) {
  for (const beat of Object.values(data.beats)) {
    const arcLists = data.arcs.filter((a) => a.beatIds.includes(beat.id))
    expect(arcLists.map((a) => a.id)).toEqual([beat.arcId])
    const chapterLists = data.chapters.filter((c) => c.beatIds.includes(beat.id))
    expect(chapterLists.map((c) => c.id)).toEqual(beat.chapterId ? [beat.chapterId] : [])
  }
  const listed = [...data.arcs.flatMap((a) => a.beatIds), ...data.chapters.flatMap((c) => c.beatIds)]
  for (const id of listed) expect(data.beats[id]).toBeDefined()
}

describe('beats', () => {
  it('adds an unplaced beat to the end of its arc', () => {
    let { data, main } = setup()
    let a: string, b: string
    ;[data, a] = addBeat(data, { arcId: main, title: 'A' })
    ;[data, b] = addBeat(data, { arcId: main, title: 'B' })
    expect(data.arcs[0].beatIds).toEqual([a, b])
    expect(data.beats[a].chapterId).toBeNull()
    expectConsistent(data)
  })

  it('adds a beat into a chapter and slots it into the arc by chapter order', () => {
    let { data, main, ch1, ch2, ch3 } = setup()
    let late: string, early: string, mid: string, loose: string
    ;[data, loose] = addBeat(data, { arcId: main, title: 'unplaced' })
    ;[data, late] = addBeat(data, { arcId: main, title: 'late', chapterId: ch3 })
    ;[data, early] = addBeat(data, { arcId: main, title: 'early', chapterId: ch1 })
    ;[data, mid] = addBeat(data, { arcId: main, title: 'mid', chapterId: ch2 })
    expect(data.arcs[0].beatIds).toEqual([loose, early, mid, late])
    expect(data.chapters[1].beatIds).toEqual([mid])
    expectConsistent(data)
  })

  it('moves a beat between chapters and out of them', () => {
    let { data, main, ch1, ch2 } = setup()
    let a: string, b: string
    ;[data, a] = addBeat(data, { arcId: main, title: 'A', chapterId: ch1 })
    ;[data, b] = addBeat(data, { arcId: main, title: 'B', chapterId: ch2 })
    data = placeBeat(data, a, ch2, 0)
    expect(data.chapters[1].beatIds).toEqual([a, b])
    expect(data.chapters[0].beatIds).toEqual([])
    expect(data.beats[a].chapterId).toBe(ch2)
    data = placeBeat(data, b, null)
    expect(data.chapters[1].beatIds).toEqual([a])
    expect(data.beats[b].chapterId).toBeNull()
    expectConsistent(data)
  })

  it('keeps the arc order when a beat is placed', () => {
    let { data, main, ch1 } = setup()
    let a: string, b: string
    ;[data, a] = addBeat(data, { arcId: main, title: 'A' })
    ;[data, b] = addBeat(data, { arcId: main, title: 'B' })
    data = placeBeat(data, b, ch1)
    expect(data.arcs[0].beatIds).toEqual([a, b])
  })

  it('moves a beat to another arc', () => {
    let { data, main, love, ch1 } = setup()
    let a: string
    ;[data, a] = addBeat(data, { arcId: main, title: 'A', chapterId: ch1 })
    data = setBeatArc(data, a, love)
    expect(data.beats[a].arcId).toBe(love)
    expect(data.arcs[0].beatIds).toEqual([])
    expect(data.arcs[1].beatIds).toEqual([a])
    expectConsistent(data)
  })

  it('deletes a beat from its arc and chapter', () => {
    let { data, main, ch1 } = setup()
    let a: string
    ;[data, a] = addBeat(data, { arcId: main, title: 'A', chapterId: ch1 })
    data = deleteBeat(data, a)
    expect(data.beats[a]).toBeUndefined()
    expect(data.arcs[0].beatIds).toEqual([])
    expect(data.chapters[0].beatIds).toEqual([])
  })
})

describe('chapters and arcs', () => {
  it('unplaces the beats of a deleted chapter', () => {
    let { data, main, ch1 } = setup()
    let a: string
    ;[data, a] = addBeat(data, { arcId: main, title: 'A', chapterId: ch1 })
    data = deleteChapter(data, ch1)
    expect(data.chapters).toHaveLength(2)
    expect(data.beats[a].chapterId).toBeNull()
    expect(data.arcs[0].beatIds).toEqual([a])
    expectConsistent(data)
  })

  it('deletes an arc together with its beats', () => {
    let { data, main, love, ch1 } = setup()
    let a: string, b: string
    ;[data, a] = addBeat(data, { arcId: main, title: 'A', chapterId: ch1 })
    ;[data, b] = addBeat(data, { arcId: love, title: 'B', chapterId: ch1 })
    data = deleteArc(data, main)
    expect(data.beats[a]).toBeUndefined()
    expect(data.chapters[0].beatIds).toEqual([b])
    expectConsistent(data)
  })

  it('reorders chapters', () => {
    let { data, ch1, ch2, ch3 } = setup()
    data = moveChapter(data, 0, 2)
    expect(data.chapters.map((c) => c.id)).toEqual([ch2, ch3, ch1])
  })

  it('inserts a chapter at an index', () => {
    let { data, ch1 } = setup()
    let added: string
    ;[data, added] = addChapter(data, { index: 0 })
    expect(data.chapters[0].id).toBe(added)
    expect(data.chapters[1].id).toBe(ch1)
  })
})

describe('applyChapterLayout', () => {
  it('commits a drag result and updates chapter links', () => {
    let { data, main, ch1, ch2 } = setup()
    let a: string, b: string, c: string
    ;[data, a] = addBeat(data, { arcId: main, title: 'A', chapterId: ch1 })
    ;[data, b] = addBeat(data, { arcId: main, title: 'B', chapterId: ch1 })
    ;[data, c] = addBeat(data, { arcId: main, title: 'C' })
    data = applyChapterLayout(data, { [ch1]: [b], [ch2]: [c, a] })
    expect(data.chapters[0].beatIds).toEqual([b])
    expect(data.chapters[1].beatIds).toEqual([c, a])
    expect(data.beats[a].chapterId).toBe(ch2)
    expect(data.beats[c].chapterId).toBe(ch2)
    expectConsistent(data)
  })

  it('unplaces beats dropped from every chapter', () => {
    let { data, main, ch1 } = setup()
    let a: string
    ;[data, a] = addBeat(data, { arcId: main, title: 'A', chapterId: ch1 })
    data = applyChapterLayout(data, { [ch1]: [] })
    expect(data.beats[a].chapterId).toBeNull()
    expectConsistent(data)
  })
})

describe('normalizeStory', () => {
  it('keeps a valid story unchanged', () => {
    const sample = buildSampleStory()
    expect(normalizeStory(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
    expectConsistent(sample)
  })

  it('repairs broken links', () => {
    const data = normalizeStory({
      title: 'Broken',
      arcs: [{ id: 'a1', name: 'A', color: '#000', beatIds: ['b1', 'b1', 'ghost'] }],
      chapters: [
        { id: 'c1', title: 'One', beatIds: ['b1', 'b2'] },
        { id: 'c2', title: 'Two', beatIds: ['b1'] },
      ],
      beats: {
        b1: { id: 'b1', arcId: 'a1', title: 'B1', chapterId: 'c1' },
        b2: { id: 'b2', arcId: 'a1', title: 'B2', chapterId: 'missing' },
        b3: { id: 'b3', arcId: 'nope', title: 'orphan', chapterId: null },
      },
    })
    expect(data.arcs[0].beatIds).toEqual(['b1', 'b2'])
    expect(data.chapters[0].beatIds).toEqual(['b1'])
    expect(data.chapters[1].beatIds).toEqual([])
    expect(data.beats.b2.chapterId).toBeNull()
    expect(data.beats.b3).toBeUndefined()
    expectConsistent(data)
  })

  it('survives garbage', () => {
    expect(normalizeStory('nope')).toEqual(emptyStory())
  })

  it('upgrades a story saved before characters existed', () => {
    const data = normalizeStory({
      title: 'Old',
      arcs: [{ id: 'a1', name: 'A', color: '#000', description: '', beatIds: [] }],
      chapters: [{ id: 'c1', title: 'One', summary: '', beatIds: [] }],
      beats: {},
    })
    expect(data.characters).toEqual([])
    expect(data.arcs[0].characterIds).toEqual([])
    expect(data.chapters[0].povCharacterId).toBeNull()
  })

  it('drops links to missing characters and links plain @names', () => {
    const data = normalizeStory({
      characters: [{ id: 'chr_1', name: 'Mara', color: '#0a0', attributes: [{ id: 'x', label: 'Age', value: '29' }] }],
      arcs: [{ id: 'a1', name: '@Mara arc', color: '#000', beatIds: [], characterIds: ['chr_1', 'chr_gone'] }],
      chapters: [{ id: 'c1', title: 'One', summary: 'Hi @Mara', beatIds: [], povCharacterId: 'chr_gone' }],
      beats: {},
    })
    expect(data.arcs[0].characterIds).toEqual(['chr_1'])
    expect(data.chapters[0].povCharacterId).toBeNull()
    expect(data.chapters[0].summary).toBe(`Hi ${mentionToken('chr_1')}`)
    expect(data.arcs[0].name).toBe(`${mentionToken('chr_1')} arc`)
    expect(data.characters[0].attributes[0].value).toBe('29')
  })
})

describe('characters', () => {
  it('renames everywhere because mentions store the id', () => {
    let { data, main, ch1 } = setup()
    let mara: string, beat: string
    ;[data, mara] = addCharacter(data, { name: 'Mara', color: '#0a0' })
    ;[data, beat] = addBeat(data, { arcId: main, title: `${mentionToken(mara)} arrives`, chapterId: ch1 })
    data = updateCharacter(data, mara, { name: 'Mara Quinn' })
    expect(toDisplay(data.beats[beat].title, lookupOf(data.characters))).toBe('Mara Quinn arrives')
  })

  it('assigns arcs and POV, and cleans up when deleted', () => {
    let { data, main, ch1 } = setup()
    let mara: string, beat: string
    ;[data, mara] = addCharacter(data, { name: 'Mara', color: '#0a0' })
    data = setArcCharacter(data, main, mara, true)
    data = setArcCharacter(data, main, mara, true)
    expect(data.arcs[0].characterIds).toEqual([mara])
    data = updateChapter(data, ch1, { povCharacterId: mara })
    expect(data.chapters[0].povCharacterId).toBe(mara)
    ;[data, beat] = addBeat(data, { arcId: main, title: `Meet ${mentionToken(mara)}` })
    data = deleteCharacter(data, mara)
    expect(data.characters).toEqual([])
    expect(data.arcs[0].characterIds).toEqual([])
    expect(data.chapters[0].povCharacterId).toBeNull()
    expect(data.beats[beat].title).toBe('Meet Mara')
  })

  it('ignores a POV for a character that does not exist', () => {
    let { data, ch1 } = setup()
    data = updateChapter(data, ch1, { povCharacterId: 'chr_nobody' })
    expect(data.chapters[0].povCharacterId).toBeNull()
  })

  it('edits, reorders and removes attributes', () => {
    let { data } = setup()
    let mara: string, age: string, wants: string
    ;[data, mara] = addCharacter(data, { name: 'Mara', color: '#0a0' })
    ;[data, age] = addAttribute(data, mara, { label: 'Age' })
    ;[data, wants] = addAttribute(data, mara, { label: 'Wants' })
    data = updateAttribute(data, mara, age, { value: '29' })
    data = moveAttribute(data, mara, 1, 0)
    expect(data.characters[0].attributes.map((a) => [a.label, a.value])).toEqual([
      ['Wants', ''],
      ['Age', '29'],
    ])
    data = deleteAttribute(data, mara, wants)
    expect(data.characters[0].attributes.map((a) => a.id)).toEqual([age])
  })
})

describe('chapter texts', () => {
  const para = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content })
  const doc = (...content: RichNode[]): RichNode => ({ type: 'doc', content })
  const text = (t: string, marks?: RichNode['marks']): RichNode => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t })
  const link = (beatId: string) => ({ type: 'beatLink', attrs: { beatId } })

  it('saves text only for chapters that exist, and drops it with the chapter', () => {
    let { data, ch1 } = setup()
    data = setChapterText(data, ch1, { doc: doc(para(text('Hi'))), words: 1, updatedAt: 1 })
    data = setChapterText(data, 'ch_missing', { doc: doc(), words: 0, updatedAt: 1 })
    expect(Object.keys(data.texts)).toEqual([ch1])
    data = deleteChapter(data, ch1)
    expect(data.texts).toEqual({})
  })

  it('removes a deleted beat’s highlights and merges the text back together', () => {
    let { data, main, ch1 } = setup()
    let a: string
    ;[data, a] = addBeat(data, { arcId: main, title: 'A', chapterId: ch1 })
    data = setChapterText(data, ch1, {
      doc: doc(para(text('The '), text('storm', [link(a)]), text(' hit.'))),
      words: 3,
      updatedAt: 1,
    })
    data = deleteBeat(data, a)
    expect(data.texts[ch1].doc).toEqual(doc(para(text('The storm hit.'))))
  })

  it('turns a deleted character’s mentions into their name', () => {
    let { data, ch1 } = setup()
    let mara: string
    ;[data, mara] = addCharacter(data, { name: 'Mara', color: '#0a0' })
    const mention = { type: 'mention', attrs: { id: mara, label: 'Mara' } }
    data = setChapterText(data, ch1, { doc: doc(para(mention, text(' ran.'))), words: 2, updatedAt: 1 })
    data = deleteCharacter(data, mara)
    expect(data.texts[ch1].doc).toEqual(doc(para(text('Mara ran.'))))
  })

  it('keeps valid texts and beat progress when loading', () => {
    const data = normalizeStory({
      chapters: [{ id: 'c1', title: 'One', beatIds: [] }],
      arcs: [{ id: 'a1', name: 'A', color: '#000', beatIds: ['b1'] }],
      beats: { b1: { id: 'b1', arcId: 'a1', title: 'B', done: true }, b2: { id: 'b2', arcId: 'a1', title: 'C' } },
      texts: {
        c1: { doc: { type: 'doc', content: [] }, words: 12, updatedAt: 5 },
        c2: { doc: { type: 'doc' }, words: 1 },
        bad: 'nope',
      },
    })
    expect(Object.keys(data.texts)).toEqual(['c1'])
    expect(data.texts.c1.words).toBe(12)
    expect(data.beats.b1.done).toBe(true)
    expect(data.beats.b2.done).toBe(false)
  })
})

describe('mind map', () => {
  it('places story items, notes and lines; removing a card keeps the item', () => {
    let { data, ch1, main } = setup()
    let a: string | null, b: string | null, e: string | null
    ;[data, a] = addMapNode(data, { kind: 'chapter', refId: ch1, x: 0, y: 0 })
    ;[data, b] = addMapNode(data, { kind: 'note', x: 300, y: 0, width: 200, height: 150, text: 'Idea', color: 'yellow' })
    ;[data, e] = addMapEdge(data, a!, b!)
    expect(e).not.toBeNull()
    expect(addMapEdge(data, b!, a!)[1]).toBeNull()
    expect(addMapEdge(data, a!, a!)[1]).toBeNull()
    expect(addMapNode(data, { kind: 'arc', refId: 'arc_missing', x: 0, y: 0 })[1]).toBeNull()
    data = moveMapNodes(data, { [a!]: { x: 50, y: 60 } })
    expect(data.mindMaps[0].nodes[0]).toMatchObject({ x: 50, y: 60 })
    data = removeMapNodes(data, [a!])
    expect(data.mindMaps[0].nodes.map((n) => n.id)).toEqual([b])
    expect(data.mindMaps[0].edges).toEqual([])
    expect(data.chapters.map((c) => c.id)).toContain(ch1)
    void main
  })

  it('drops cards of deleted items, with their lines', () => {
    let { data, main, ch1 } = setup()
    let beat: string, mara: string, nBeat: string | null, nArc: string | null, nMara: string | null
    ;[data, beat] = addBeat(data, { arcId: main, title: 'B', chapterId: ch1 })
    ;[data, mara] = addCharacter(data, { name: 'Mara', color: '#0a0' })
    ;[data, nBeat] = addMapNode(data, { kind: 'beat', refId: beat, x: 0, y: 0 })
    ;[data, nArc] = addMapNode(data, { kind: 'arc', refId: main, x: 0, y: 0 })
    ;[data, nMara] = addMapNode(data, { kind: 'character', refId: mara, x: 0, y: 0 })
    ;[data] = addMapEdge(data, nMara!, nArc!)
    data = deleteCharacter(data, mara)
    expect(data.mindMaps[0].nodes.map((n) => n.id)).toEqual([nBeat, nArc])
    expect(data.mindMaps[0].edges).toEqual([])
    data = deleteArc(data, main)
    expect(data.mindMaps[0].nodes).toEqual([])
  })

  it('follows renames in notes and turns deleted characters into plain names', () => {
    let { data } = setup()
    let mara: string, note: string | null
    ;[data, mara] = addCharacter(data, { name: 'Mara', color: '#0a0' })
    ;[data, note] = addMapNode(data, {
      kind: 'note', x: 0, y: 0, width: 200, height: 150, color: 'pink', text: `Ask ${mentionToken(mara)}`,
    })
    data = deleteCharacter(data, mara)
    expect(data.mindMaps[0].nodes.find((n) => n.id === note)).toMatchObject({ text: 'Ask Mara' })
  })

  it('draws lines between spots inside cards, and drops them with the item', () => {
    let { data, ch1, main } = setup()
    let beat: string, mara: string, attr: string
    ;[data, beat] = addBeat(data, { arcId: main, title: 'Storm', chapterId: ch1 })
    ;[data, mara] = addCharacter(data, { name: 'Mara', color: '#0a0' })
    ;[data, attr] = addAttribute(data, mara, { label: 'Fears', value: 'Water' })
    let arcCard: string | null, maraCard: string | null
    ;[data, arcCard] = addMapNode(data, { kind: 'arc', refId: main, x: 0, y: 0 })
    ;[data, maraCard] = addMapNode(data, { kind: 'character', refId: mara, x: 400, y: 0 })
    const fromBeat = { source: `beat:${beat}`, target: `attr:${attr}` }
    const [withLine, line] = addMapEdge(data, arcCard!, maraCard!, fromBeat)
    expect(withLine.mindMaps[0].edges[0]).toMatchObject({ id: line, sourceAnchor: `beat:${beat}`, targetAnchor: `attr:${attr}` })
    // The same line again (either way round) is a repeat; card to card is a different line.
    expect(addMapEdge(withLine, maraCard!, arcCard!, { source: `attr:${attr}`, target: `beat:${beat}` })[1]).toBeNull()
    expect(addMapEdge(withLine, arcCard!, maraCard!)[1]).not.toBeNull()
    // Two spots in one card can be joined; a card can't be joined to itself.
    expect(addMapEdge(withLine, arcCard!, arcCard!, { source: `beat:${beat}`, target: 'beat:other' })[1]).not.toBeNull()
    expect(addMapEdge(withLine, arcCard!, arcCard!)[1]).toBeNull()
    expect(addMapEdge(withLine, arcCard!, arcCard!, { source: `beat:${beat}`, target: `beat:${beat}` })[1]).toBeNull()
    // Deleting the attribute or the beat takes the line with it; the cards stay.
    expect(deleteAttribute(withLine, mara, attr).mindMaps[0].edges).toEqual([])
    expect(deleteBeat(withLine, beat).mindMaps[0].edges).toEqual([])
    expect(deleteCharacter(withLine, mara).mindMaps[0].edges).toEqual([])
    expect(deleteBeat(withLine, beat).mindMaps[0].nodes).toHaveLength(2)
    // Anchors survive a reload.
    expect(normalizeStory(withLine).mindMaps[0].edges[0]).toMatchObject({ sourceAnchor: `beat:${beat}`, targetAnchor: `attr:${attr}` })
  })

  it('tallies the words written each day, and keeps goals', () => {
    let { data, ch1, ch2 } = setup()
    const doc = { type: 'doc', content: [] }
    data = setChapterText(data, ch1, { doc, words: 300, updatedAt: 1 }, '2026-09-01')
    data = setChapterText(data, ch1, { doc, words: 250, updatedAt: 2 }, '2026-09-02')
    data = setChapterText(data, ch2, { doc, words: 120, updatedAt: 3 }, '2026-09-02')
    data = setChapterText(data, ch2, { doc, words: 120, updatedAt: 4 }, '2026-09-03')
    expect(data.wordLog).toEqual({ '2026-09-01': 300, '2026-09-02': 70 })
    // Saving without a day (the example story) leaves the log alone.
    expect(setChapterText(data, ch1, { doc, words: 900, updatedAt: 5 }, null).wordLog).toBe(data.wordLog)
    data = setGoals(data, { draft: 80000, daily: 500 })
    expect(data.goals).toEqual({ draft: 80000, daily: 500 })
    data = setGoals(data, { daily: 0 })
    expect(data.goals).toEqual({ draft: 80000 })
    const loaded = normalizeStory({ ...data, goals: { draft: -3, daily: 400 }, wordLog: { '2026-09-01': 10, nonsense: 5, '2026-09-02': 'x' } })
    expect(loaded.goals).toEqual({ daily: 400 })
    expect(loaded.wordLog).toEqual({ '2026-09-01': 10 })
  })

  it('counts the outline’s words apart from the manuscript, and tallies them each day', () => {
    let { data, main, love } = setup()
    // Chapters One, Two and Three; arcs Main and Love
    expect(outlineWords(data)).toMatchObject({ chapters: 3, arcs: 2, beats: 0, total: 5 })
    let tom: string
    ;[data, tom] = addCharacter(data, { name: 'Old Tom', color: '#08f' })
    const before = data
    let b: string
    ;[data, b] = addBeat(data, { arcId: main, title: `${mentionToken(tom)}’s boat sinks`, description: 'Nobody  saw it.' })
    // A mention counts as one word, as in the manuscript
    expect(wordsIn(`${mentionToken(tom)}’s boat sinks`)).toBe(3)
    const counted = outlineWords(data)
    expect([counted.beats, counted.byArc[main], counted.byArc[love], counted.total]).toEqual([6, 7, 1, 11])
    data = logOutline(before, data, '2026-09-01')
    expect(data.outlineLog).toEqual({ '2026-09-01': 6 })
    // Words cut count against the day; changes with no words in them leave the log be
    const longer = data
    data = logOutline(longer, updateBeat(longer, b, { description: '' }), '2026-09-01')
    expect(data.outlineLog).toEqual({ '2026-09-01': 3 })
    const placed = placeBeat(data, b, data.chapters[0].id)
    expect(logOutline(data, placed, '2026-09-02')).toBe(placed)
    expect(normalizeStory({ ...data, outlineLog: { '2026-09-01': 3, nope: 4 } }).outlineLog).toEqual({ '2026-09-01': 3 })
    expect(normalizeStory({ title: 'Old' }).outlineLog).toEqual({})
  })

  it('keeps each chapter’s status and word target', () => {
    let { data, ch1 } = setup()
    expect(data.chapters[0].status).toBe('outline')
    data = updateChapter(data, ch1, { status: 'revised', targetWords: 2500.4 })
    expect(data.chapters[0]).toMatchObject({ status: 'revised', targetWords: 2500 })
    expect(updateChapter(data, ch1, { status: 'nonsense' as never })).toBe(data)
    expect(updateChapter(data, ch1, { targetWords: 0 }).chapters[0]).not.toHaveProperty('targetWords')
    // Saves from before statuses: written chapters count as drafts.
    const old = normalizeStory({
      chapters: [
        { id: 'a', title: 'Written' },
        { id: 'b', title: 'Not yet' },
        { id: 'c', title: 'Done', status: 'done', targetWords: 'lots' },
      ],
      texts: { a: { doc: { type: 'doc', content: [] }, words: 120, updatedAt: 1 } },
    })
    expect(old.chapters.map((c) => c.status)).toEqual(['draft', 'outline', 'done'])
    expect(old.chapters[2]).not.toHaveProperty('targetWords')
  })

  it('keeps several mind maps, each with its own cards', () => {
    let { data, ch1, main } = setup()
    let second: string
    ;[data, second] = addMindMap(data, 'Clues')
    expect(data.mindMaps.map((m) => m.name)).toEqual(['Mind map', 'Clues'])
    let a: string | null, b: string | null, c: string | null
    ;[data, a] = addMapNode(data, { kind: 'chapter', refId: ch1, x: 0, y: 0 })
    ;[data, b] = addMapNode(data, { kind: 'arc', refId: main, x: 0, y: 0 }, second)
    ;[data, c] = addMapNode(data, { kind: 'chapter', refId: ch1, x: 0, y: 0 }, second)
    expect(data.mindMaps.map((m) => m.nodes.length)).toEqual([1, 2])
    // Lines join cards on the same map only.
    expect(addMapEdge(data, a!, b!)[1]).toBeNull()
    ;[data] = addMapEdge(data, b!, c!)
    expect(data.mindMaps[1].edges).toHaveLength(1)
    // Edits find the card on whichever map it's on.
    data = updateMapNode(data, c!, { x: 99 })
    expect(data.mindMaps[1].nodes[1]).toMatchObject({ x: 99 })
    // Deleting the chapter takes its cards off every map.
    const gone = deleteChapter(data, ch1)
    expect(gone.mindMaps.map((m) => m.nodes.length)).toEqual([0, 1])
    expect(gone.mindMaps[1].edges).toEqual([])
    data = renameMindMap(data, second, 'Clues and red herrings')
    expect(data.mindMaps[1].name).toBe('Clues and red herrings')
    data = deleteMindMap(data, data.mindMaps[0].id)
    expect(data.mindMaps.map((m) => m.id)).toEqual([second])
    const last = deleteMindMap(data, second)
    expect(last.mindMaps).toHaveLength(1)
    expect(last.mindMaps[0].nodes).toEqual([])
  })

  it('moves a save’s single mind map into the list of maps', () => {
    const data = normalizeStory({
      chapters: [{ id: 'c1', title: 'One', beatIds: [] }],
      mindMap: { nodes: [{ id: 'n1', kind: 'chapter', refId: 'c1', x: 5, y: 5 }], edges: [] },
    })
    expect(data.mindMaps).toEqual([{ id: 'map_main', name: 'Mind map', nodes: [{ id: 'n1', kind: 'chapter', refId: 'c1', x: 5, y: 5 }], edges: [] }])
    // Card ids stay unique across maps.
    const copied = normalizeStory({
      chapters: [{ id: 'c1', title: 'One', beatIds: [] }],
      mindMaps: [
        { id: 'm1', name: 'A', nodes: [{ id: 'n1', kind: 'chapter', refId: 'c1', x: 0, y: 0 }] },
        { id: 'm1', name: '', nodes: [{ id: 'n1', kind: 'note', x: 0, y: 0, text: 'x', color: 'blue' }, { id: 'n2', kind: 'note', x: 0, y: 0, text: 'y', color: 'blue' }], edges: [{ id: 'e1', source: 'n1', target: 'n2' }] },
      ],
    })
    const [first, other] = copied.mindMaps
    expect(other.id).not.toBe(first.id)
    expect(other.name).toBe('Untitled map')
    expect(other.nodes[0].id).not.toBe('n1')
    expect(other.edges[0].source).toBe(other.nodes[0].id)
  })

  it('repairs a loaded map', () => {
    const data = normalizeStory({
      chapters: [{ id: 'c1', title: 'One', beatIds: [] }],
      mindMap: {
        nodes: [
          { id: 'n1', kind: 'chapter', refId: 'c1', x: 10, y: 'x' },
          { id: 'n2', kind: 'chapter', refId: 'gone', x: 0, y: 0 },
          { id: 'n3', kind: 'note', x: 0, y: 0, color: 'neon', text: 'Hi @Nobody' },
          { id: 'n4', kind: 'blob' },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n3', label: 'why' },
          { id: 'e2', source: 'n1', target: 'n2' },
          { id: 'e3', source: 'n1', target: 'n1' },
        ],
      },
    })
    expect(data.mindMaps[0].nodes.map((n) => n.id)).toEqual(['n1', 'n3'])
    expect(data.mindMaps[0].nodes[0]).toMatchObject({ x: 10, y: 0 })
    expect(data.mindMaps[0].nodes[1]).toMatchObject({ color: '#fbe7a1', width: 220, height: 160 })
    expect(data.mindMaps[0].edges).toEqual([{ id: 'e1', source: 'n1', target: 'n3', label: 'why', arrow: false }])
  })

  it('keeps how cards are opened up and how text boxes look', () => {
    const data = normalizeStory({
      chapters: [{ id: 'c1', title: 'One', beatIds: [] }],
      arcs: [{ id: 'a1', name: 'Main', color: '#123456', beatIds: [] }],
      mindMap: {
        nodes: [
          { id: 'n1', kind: 'chapter', refId: 'c1', x: 0, y: 0, expanded: 'text' },
          { id: 'n2', kind: 'arc', refId: 'a1', x: 0, y: 0, expanded: 'beats' },
          { id: 'n3', kind: 'arc', refId: 'a1', x: 0, y: 0, expanded: 'text' },
          { id: 'n4', kind: 'text', x: 0, y: 0, text: 'Rope\nLantern', bg: 'green', list: 'check', checked: [1, 1, 5, -1, 'x'] },
          { id: 'n5', kind: 'text', x: 0, y: 0, text: 'Plain', bg: 'neon', list: 'stars' },
          {
            id: 'n6',
            kind: 'chapter',
            refId: 'c1',
            x: 0,
            y: 0,
            expanded: 'beats',
            sizes: { text: { width: 500, height: 99999 }, beats: { width: 'wide' }, details: { width: 300, height: 300 } },
          },
          { id: 'n7', kind: 'note', x: 0, y: 0, text: 'A\nB', color: 'white', list: 'bullet', checked: [0] },
          { id: 'n8', kind: 'character', refId: 'ch1', x: 0, y: 0, expanded: 'details' },
        ],
      },
      characters: [{ id: 'ch1', name: 'Mara', color: '#123456' }],
    })
    const [chapter, arc, badArc, list, plain, sized, note, character] = data.mindMaps[0].nodes
    expect(sized).toMatchObject({ expanded: 'beats', sizes: { text: { width: 500, height: 4000 } } })
    expect(sized).not.toHaveProperty('sizes.beats')
    expect(sized).not.toHaveProperty('sizes.details')
    expect(note).toMatchObject({ color: '#ffffff', list: 'bullet', checked: [0] })
    expect(character).toMatchObject({ expanded: 'details' })
    expect(chapter).toMatchObject({ expanded: 'text' })
    expect(arc).toMatchObject({ expanded: 'beats' })
    expect(badArc).not.toHaveProperty('expanded')
    expect(list).toMatchObject({ bg: '#cfe9c8', list: 'check', checked: [1] })
    expect(plain).not.toHaveProperty('bg')
    expect(plain).not.toHaveProperty('list')
    expect(plain).not.toHaveProperty('checked')
  })

  it('keeps text sizes, turning the old small, medium and large into sizes', () => {
    const data = normalizeStory({
      mindMap: {
        nodes: [
          { id: 't1', kind: 'text', x: 0, y: 0, text: 'a', size: 'sm' },
          { id: 't2', kind: 'text', x: 0, y: 0, text: 'b', size: 'lg' },
          { id: 't3', kind: 'text', x: 0, y: 0, text: 'c' },
          { id: 't4', kind: 'text', x: 0, y: 0, text: 'd', size: 500 },
          { id: 't5', kind: 'text', x: 0, y: 0, text: 'e', size: 22.25 },
          { id: 'n1', kind: 'note', x: 0, y: 0, text: 'f', color: 'yellow', size: 30 },
          { id: 'n2', kind: 'note', x: 0, y: 0, text: 'g', color: 'yellow', size: 'huge' },
        ],
      },
    })
    const sizes = data.mindMaps[0].nodes.map((n) => ('size' in n ? n.size : undefined))
    expect(sizes).toEqual([14, 34, 20, 200, 22.3, 30, undefined])
    expect('size' in data.mindMaps[0].nodes[6]).toBe(false)
  })
})

describe('places and other elements', () => {
  it('adds, edits and deletes one, turning its mentions into its name', () => {
    let { data, ch1, main } = setup()
    let dock: string, beat: string, mara: string, attr: string
    ;[data, dock] = addElement(data, { name: 'The Dock', kind: 'place', color: '#08f' })
    ;[data, mara] = addCharacter(data, { name: 'Mara', color: '#0a0' })
    ;[data, beat] = addBeat(data, { arcId: main, title: `Mara waits at ${mentionToken(dock)}`, chapterId: ch1 })
    ;[data, attr] = addAttribute(data, mara, { label: 'Home', value: mentionToken(dock) })
    expect(data.elements[0]).toMatchObject({ id: dock, kind: 'place', name: 'The Dock', attributes: [] })
    // Renaming shows everywhere; a kind that isn't one is ignored.
    data = updateElement(data, dock, { name: 'The Old Dock', kind: 'object' })
    expect(toDisplay(data.beats[beat].title, lookupOf(mentionables(data)))).toBe('Mara waits at The Old Dock')
    expect(updateElement(data, dock, { kind: 'planet' as never })).toBe(data)
    const doc: RichNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'At ' }, { type: 'mention', attrs: { id: dock, label: 'x' } }] }],
    }
    data = setChapterText(data, ch1, { doc, words: 2, updatedAt: 1 }, null)
    let card: string | null
    ;[data, card] = addMapNode(data, { kind: 'element', refId: dock, x: 0, y: 0 })
    expect(card).not.toBeNull()
    const gone = deleteElement(data, dock)
    expect(gone.elements).toEqual([])
    expect(gone.beats[beat].title).toBe('Mara waits at The Old Dock')
    expect(gone.characters[0].attributes.find((a) => a.id === attr)?.value).toBe('The Old Dock')
    expect(gone.texts[ch1].doc.content?.[0].content).toEqual([{ type: 'text', text: 'At The Old Dock' }])
    expect(gone.mindMaps[0].nodes).toEqual([])
  })

  it('has attributes like a character, and lines drawn from them go with them', () => {
    let data = emptyStory()
    let key: string, owner: string, color: string
    ;[data, key] = addElement(data, { name: 'Key', kind: 'object', color: '#fa0' })
    ;[data, owner] = addAttribute(data, key, { label: 'Owner' })
    ;[data, color] = addAttribute(data, key, { label: 'Colour', value: 'Silver' })
    data = updateAttribute(data, key, owner, { value: 'Mara' })
    data = moveAttribute(data, key, 1, 0)
    expect(data.elements[0].attributes.map((a) => [a.label, a.value])).toEqual([
      ['Colour', 'Silver'],
      ['Owner', 'Mara'],
    ])
    let card: string | null, note: string | null
    ;[data, card] = addMapNode(data, { kind: 'element', refId: key, x: 0, y: 0 })
    ;[data, note] = addMapNode(data, { kind: 'note', x: 300, y: 0, width: 200, height: 150, text: '', color: 'yellow' })
    ;[data] = addMapEdge(data, card!, note!, { source: `attr:${color}` })
    expect(data.mindMaps[0].edges).toHaveLength(1)
    const without = deleteAttribute(data, key, color)
    expect(without.elements[0].attributes).toHaveLength(1)
    expect(without.mindMaps[0].edges).toEqual([])
    // An id that is neither a character nor an element changes nothing.
    expect(addAttribute(data, 'elm_nope')[0]).toBe(data)
  })

  it('links a typed @Name to an element, and prefers the longest name', () => {
    let data = emptyStory()
    let city: string, oldCity: string, main: string
    ;[data, city] = addElement(data, { name: 'Harbor', kind: 'place', color: '#08f' })
    ;[data, oldCity] = addElement(data, { name: 'Harbor Town', kind: 'place', color: '#0af' })
    ;[data, main] = addArc(data, { name: 'Main', color: '#f00' })
    let beat: string
    ;[data, beat] = addBeat(data, { arcId: main, title: 'From @Harbor Town to @harbor.' })
    data = linkMentions(data)
    expect(data.beats[beat].title).toBe(`From ${mentionToken(oldCity)} to ${mentionToken(city)}.`)
  })

  it('loads elements, repairing bad ones and dropping map cards for missing ones', () => {
    const loaded = normalizeStory({
      elements: [
        { id: 'elm_1', kind: 'group', name: 'The Watch', color: '#123', attributes: [{ label: 'Leader', value: '' }] },
        { id: 'not-an-element-id', kind: 'weird', name: 'Fog' },
      ],
      mindMaps: [
        {
          id: 'map_main',
          name: 'Map',
          nodes: [
            { id: 'n1', kind: 'element', refId: 'elm_1', x: 0, y: 0, expanded: 'details' },
            { id: 'n2', kind: 'element', refId: 'elm_missing', x: 0, y: 0 },
            { id: 'n3', kind: 'element', refId: 'elm_1', x: 0, y: 0, expanded: 'text' },
          ],
          edges: [],
        },
      ],
    })
    expect(loaded.elements[0]).toMatchObject({ id: 'elm_1', kind: 'group', name: 'The Watch' })
    expect(loaded.elements[0].attributes[0].id).toMatch(/^attr_/)
    // Ids must look like element ids for mentions to find them.
    expect(loaded.elements[1].id).toMatch(/^elm_/)
    expect(loaded.elements[1]).toMatchObject({ kind: 'other', name: 'Fog', color: '#6f7480', description: '' })
    expect(loaded.mindMaps[0].nodes.map((n) => n.id)).toEqual(['n1', 'n3'])
    expect(loaded.mindMaps[0].nodes[0]).toMatchObject({ expanded: 'details' })
    // Elements only open up to their details.
    expect(loaded.mindMaps[0].nodes[1]).not.toHaveProperty('expanded')
    // Saves from before elements existed.
    expect(normalizeStory({ title: 'Old' }).elements).toEqual([])
  })

  it('finds everywhere something is mentioned', () => {
    let { data, ch1, main } = setup()
    let dock: string, mara: string, gang: string
    ;[data, dock] = addElement(data, { name: 'Dock', kind: 'place', color: '#08f' })
    ;[data, gang] = addElement(data, { name: 'Gang', kind: 'group', color: '#f80', description: `Meets at ${mentionToken(dock)}` })
    ;[data, mara] = addCharacter(data, { name: 'Mara', color: '#0a0', description: `Lives at ${mentionToken(dock)}` })
    ;[data] = addBeat(data, { arcId: main, title: `To ${mentionToken(dock)}`, chapterId: ch1 })
    data = updateChapter(data, ch1, { summary: `Night at ${mentionToken(dock)}` })
    const doc: RichNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: { id: dock } }] }] }
    data = setChapterText(data, ch1, { doc, words: 1, updatedAt: 1 }, null)
    const places = mentionPlaces(data, dock)
    expect(places.beats).toHaveLength(1)
    expect(places.texts).toEqual([{ chapter: data.chapters[0], count: 1 }])
    expect(places.chapters.map((c) => c.id)).toEqual([ch1])
    expect(places.characters.map((c) => c.id)).toEqual([mara])
    expect(places.elements.map((e) => e.id)).toEqual([gang])
    expect(placeCount(places)).toBe(5)
    // Its own description doesn't count.
    expect(mentionPlaces(data, gang).elements).toEqual([])
  })
})

describe('timeline', () => {
  function story() {
    let { data, ch1, ch2, ch3, main, love } = setup()
    const add = (arcId: string, title: string, chapterId: string | null) => {
      let id: string
      ;[data, id] = addBeat(data, { arcId, title, chapterId })
      return id
    }
    const a = add(main, 'a', ch1)
    const b = add(love, 'b', ch1)
    const c = add(main, 'c', ch2)
    const loose = add(love, 'loose', null)
    return { data, a, b, c, loose, ch1, ch2, ch3, main, love }
  }
  const chapterBeats = (data: StoryData) => data.chapters.map((c) => c.beatIds)

  it('follows the reading order until the timeline is arranged', () => {
    const { data, a, b, c, loose } = story()
    expect(readingOrder(data)).toEqual([a, b, c, loose])
    expect(storyOrder(data)).toEqual([a, b, c, loose])
    expect(data.timeline).toEqual([])
  })

  it('moves a beat in time, and back to the reading order', () => {
    const { data, a, b, c, loose } = story()
    // Story time: the book's beginning, the beats, its end
    expect(storyStops(data)).toEqual([{ marker: 'start' }, { beats: [a] }, { beats: [b] }, { beats: [c] }, { beats: [loose] }, { marker: 'end' }])
    const moved = moveInStory(data, c, { gap: 1 })
    expect(storyOrder(moved)).toEqual([c, a, b, loose])
    // The reading order doesn't change.
    expect(readingOrder(moved)).toEqual([a, b, c, loose])
    expect(moveInStory(moved, c, { gap: 1 })).toBe(moved)
    expect(moveInStory(moved, c, { gap: 2 })).toBe(moved)
    expect(storyOrder(moveInStory(moved, c, { gap: 5 }))).toEqual([a, b, loose, c])
    expect(storyOrder(resetTimeline(moved))).toEqual([a, b, c, loose])
    expect(resetTimeline(data)).toBe(data)
  })

  it('marks where the book begins and ends in story time, and keeps it there', () => {
    let { data, a, b, c, loose, main } = story()
    expect([...beatsInBook(data)]).toEqual([a, b, c, loose])
    // a happened before the book: the beginning moves after it
    data = moveBookMarker(data, 'start', 2)
    expect(storyStops(data).map((s) => ('marker' in s ? s.marker : s.beats[0]))).toEqual([a, 'start', b, c, loose, 'end'])
    expect([...beatsInBook(data)]).toEqual([b, c, loose])
    // loose happens after it ends
    data = moveBookMarker(data, 'end', 4)
    expect([...beatsInBook(data)]).toEqual([b, c])
    // Put down where it is: nothing changes; never the end before the beginning
    expect(moveBookMarker(data, 'end', 4)).toBe(data)
    expect(moveBookMarker(data, 'end', 5)).toBe(data)
    expect(moveBookMarker(data, 'end', 0)).toBe(data)
    expect(moveBookMarker(data, 'start', 6)).toBe(data)
    // Beats moved across a line change sides; a new beat before the book stays out of it
    data = moveInStory(data, c, { gap: 0 })
    expect([...beatsInBook(data)]).toEqual([b])
    let n: string
    ;[data, n] = addBeatInStory(data, { arcId: main, title: 'n' }, { gap: 0 })
    expect(storyOrder(data)).toEqual([n, c, a, b, loose])
    expect([...beatsInBook(data)]).toEqual([b])
    // A beat added to a chapter (not placed in time yet) and read first is in the book
    let d: string
    ;[data, d] = addBeat(data, { arcId: main, title: 'd', chapterId: data.chapters[0].id, chapterIndex: 0 })
    expect([...beatsInBook(data)]).toEqual([d, b])
    // Kept when loading, and put right if the end came first
    expect(normalizeStory(data).timeline).toEqual(data.timeline)
    const swapped = data.timeline.map((t) => (t === BOOK_START ? BOOK_END : t === BOOK_END ? BOOK_START : t))
    expect([...beatsInBook(normalizeStory({ ...data, timeline: swapped }))]).toEqual([d, b])
    // Back to the reading order: the beats read follow it, and the book still begins and ends around
    // its beats; n and loose, in no chapter, stay before it begins and after it ends
    const reset = resetTimeline(data)
    expect(storyOrder(reset)).toEqual([n, d, a, b, c, loose])
    expect([...beatsInBook(reset)]).toEqual([d, a, b])
    // Following the reading order already: nothing to do
    expect(resetTimeline(reset)).toBe(reset)
  })

  it('keeps backstory in no chapter before the book when going back to the reading order', () => {
    let { data, a, b, c, loose, main } = story()
    let early: string
    ;[data, early] = addBeatInStory(data, { arcId: main, title: 'early' }, { gap: 0 })
    data = moveInStory(data, c, { gap: 2 })
    expect(storyOrder(data)).toEqual([early, c, a, b, loose])
    expect(beatsInBook(data).has(early)).toBe(false)
    // c is read after b again; early, read nowhere, is still backstory (not put after everything else)
    const reset = resetTimeline(data)
    expect(storyOrder(reset)).toEqual([early, a, b, c, loose])
    expect([...beatsInBook(reset)]).toEqual([a, b, c, loose])
  })

  it('puts beats of different arcs at the same moment, on top of each other, and apart again', () => {
    const { data, a, b, c, loose } = story()
    // c is in a's arc: it can't happen at once with a; nor can anything go on the book's beginning
    expect(moveInStory(data, c, { column: 1 })).toBe(data)
    expect(moveInStory(data, c, { column: 0 })).toBe(data)
    let next = moveInStory(data, loose, { column: 3 })
    expect(storyColumns(next)).toEqual([[a], [b], [c, loose]])
    expect(next.beats[loose].moment).toBeTruthy()
    expect(next.beats[loose].moment).toBe(next.beats[c].moment)
    // Chapters don't change in story time; read in no chapter, loose is shown with c there
    expect(chapterBeats(next)).toEqual(chapterBeats(data))
    // b is in loose's arc, so it can't join them
    expect(moveInStory(next, b, { column: 3 })).toBe(next)
    // A beat of a third arc can
    let x: string
    let third: string
    ;[next, third] = addArc(next, { name: 'Third', color: '#00f' })
    ;[next, x] = addBeat(next, { arcId: third, title: 'x' })
    next = moveInStory(next, x, { column: 3 })
    expect(storyColumns(next)).toEqual([[a], [b], [c, loose, x]])
    // Taken off the stack, just before it: a moment of its own again
    next = moveInStory(next, x, { gap: 3 })
    expect(storyColumns(next)).toEqual([[a], [b], [x], [c, loose]])
    expect(next.beats[x]).not.toHaveProperty('moment')
    // The last two apart: neither shares a moment any more
    next = moveInStory(next, c, { gap: 5 })
    expect(storyColumns(next)).toEqual([[a], [b], [x], [loose], [c]])
    expect([next.beats[c], next.beats[loose]].some((k) => 'moment' in k)).toBe(false)
  })

  it('moves beats to another arc, keeping when they happen and where they’re read', () => {
    let { data, a, b, c, loose, main, love } = story()
    const arcBeats = (d: StoryData) => d.arcs.map((arc) => arc.beatIds)
    // c (main, chapter two) to love: after b, which happens before it
    let next = moveBeatsToArc(data, c, love)
    expect(next.beats[c].arcId).toBe(love)
    expect(arcBeats(next)).toEqual([[a], [b, c, loose]])
    expect(storyOrder(next)).toEqual(storyOrder(data))
    expect(readingOrder(next)).toEqual(readingOrder(data))
    expect(next.timeline).toEqual([])
    expectConsistent(next)
    // Already there, or no such arc: nothing changes
    expect(moveBeatsToArc(next, c, love)).toBe(next)
    expect(moveBeatsToArc(next, c, 'nope')).toBe(next)
    // Beats in no chapter are read in their arcs' order; when that changes, story time is kept as it was
    let early: string
    ;[data, early] = addBeat(data, { arcId: main, title: 'early' })
    data = moveInStory(data, early, { gap: 1 })
    expect(storyOrder(data)).toEqual([early, a, b, c, loose])
    next = moveBeatsToArc(data, loose, main)
    expect(storyOrder(next)).toEqual([early, a, b, c, loose])
    // (Moved in time, early stayed last in main's own order: loose goes after it.)
    expect(arcBeats(next)[0]).toEqual([a, c, early, loose])
    expectConsistent(next)
  })

  it('takes a beat moved to another arc off a moment that arc already has a beat at', () => {
    let { data, a, b, c, loose, main, love } = story()
    // loose (love) happens at once with c (main)
    data = moveInStory(data, loose, { column: 3 })
    expect(storyColumns(data)).toEqual([[a], [b], [c, loose]])
    // To main: c's arc, so just after c instead
    const next = moveBeatsToArc(data, loose, main)
    expect(storyColumns(next)).toEqual([[a], [b], [c], [loose]])
    expect(next.beats[c]).not.toHaveProperty('moment')
    expect(next.beats[loose]).not.toHaveProperty('moment')
    // Both to a third arc: the first keeps the moment... with no one, so neither has it
    let third: string
    ;[data, third] = addArc(data, { name: 'Third', color: '#00f' })
    const both = moveBeatsToArc(data, [c, loose], third)
    expect(storyColumns(both)).toEqual([[a], [b], [c], [loose]])
    expect(both.arcs[2].beatIds).toEqual([c, loose])
    expectConsistent(both)
    void love
  })

  it('moves beats in time or reading order and to another arc at once', () => {
    let { data, a, b, c, loose, ch1, ch2, main, love } = story()
    // In story time: c to love, before a
    let next = moveInStory(data, c, { gap: 1 }, love)
    expect(storyColumns(next)).toEqual([[c], [a], [b], [loose]])
    expect(next.beats[c].arcId).toBe(love)
    // Onto a's moment: as main it couldn't, as love it can
    expect(moveInStory(data, c, { column: 1 })).toBe(data)
    next = moveInStory(data, c, { column: 1 }, love)
    expect(storyColumns(next)).toEqual([[a, c], [b], [loose]])
    expect(next.beats[c].arcId).toBe(love)
    // Not onto a moment that arc has a beat at
    expect(moveInStory(data, c, { column: 2 }, love)).toBe(data)
    // Put down where it is, in another lane: only the arc changes
    next = moveInStory(data, c, { gap: 3 }, love)
    expect(storyColumns(next)).toEqual(storyColumns(data))
    expect(next.beats[c].arcId).toBe(love)
    // In reading order: into chapter one, as love, at once with a
    next = moveInReading(data, c, { chapterId: ch1, column: 0 }, love)
    expect(chapterBeats(next)[0]).toEqual([a, c, b])
    expect(next.beats[c].arcId).toBe(love)
    expect(next.beats[c].moment).toBe(next.beats[a].moment)
    // ...and to main, into chapter two
    next = moveInReading(data, b, { chapterId: ch2, gap: 1 }, main)
    expect(chapterBeats(next)[1]).toEqual([c, b])
    expect(next.arcs[0].beatIds).toEqual([a, c, b])
    expectConsistent(next)
    void loose
  })

  it('moves an arc in the list without moving anything in time', () => {
    let { data, a, b, c, loose, main } = story()
    let x: string
    ;[data, x] = addBeat(data, { arcId: main, title: 'x' })
    // In no chapter: x (main) is read before loose (love), and happens before it
    expect(storyOrder(data)).toEqual([a, b, c, x, loose])
    const next = moveArc(data, 1, 0)
    expect(next.arcs.map((arc) => arc.name)).toEqual(['Love', 'Main'])
    expect(readingOrder(next)).toEqual([a, b, c, loose, x])
    expect(storyOrder(next)).toEqual([a, b, c, x, loose])
    // With nothing in no chapter to reorder, the timeline stays unarranged
    const plain = moveArc(story().data, 1, 0)
    expect(plain.timeline).toEqual([])
  })

  it('moves a beat in reading order, into other chapters and places in them', () => {
    const { data, a, b, c, loose, ch1, ch2, ch3 } = story()
    // Before a, in chapter one
    let next = moveInReading(data, c, { chapterId: ch1, gap: 0 })
    expect(chapterBeats(next)).toEqual([[c, a, b], [], []])
    expect(next.beats[c].chapterId).toBe(ch1)
    // Story time follows reading order while it isn't arranged
    expect(storyOrder(next)).toEqual([c, a, b, loose])
    // Into the empty third chapter, then out of every chapter
    next = moveInReading(next, a, { chapterId: ch3, gap: 0 })
    expect(chapterBeats(next)).toEqual([[c, b], [], [a]])
    next = moveInReading(next, a, { chapterId: null, gap: 0 })
    expect(next.beats[a].chapterId).toBeNull()
    expect(readingSections(next).map((sec) => sec.chapterId)).toEqual([ch1, ch2, ch3, null])
    // Put down where it already is: nothing changes
    expect(moveInReading(data, b, { chapterId: ch1, gap: 2 })).toBe(data)
    expect(moveInReading(data, b, { chapterId: ch1, gap: 1 })).toBe(data)
    // Within its own chapter, later
    expect(chapterBeats(moveInReading(data, a, { chapterId: ch1, gap: 2 }))).toEqual([[b, a], [c], []])
    expect(moveInReading(data, c, { chapterId: 'nope', gap: 0 })).toBe(data)
    void ch2
  })

  it('stacks beats in reading order: next to each other in the chapter, and at the same time', () => {
    let { data, a, b, c, loose, ch2 } = story()
    // Story time arranged first: c happens first
    data = moveInStory(data, c, { gap: 1 })
    const next = moveInReading(data, loose, { chapterId: ch2, column: 0 })
    expect(chapterBeats(next)[1]).toEqual([c, loose])
    expect(readingSections(next)[1].columns).toEqual([[c, loose]])
    // ...and in story time it's moved to happen with c
    expect(storyColumns(next)).toEqual([[c, loose], [a], [b]])
    // Taken off the stack to just after it: in the chapter after c, at a moment of its own
    const apart = moveInReading(next, loose, { chapterId: ch2, gap: 1 })
    expect(chapterBeats(apart)[1]).toEqual([c, loose])
    expect(readingSections(apart)[1].columns).toEqual([[c], [loose]])
    expect(apart.beats[c]).not.toHaveProperty('moment')
    // Not onto a beat of its own arc
    expect(moveInReading(data, a, { chapterId: ch2, column: 0 })).toBe(data)
    void b
  })

  it('adds beats at any point: in story time, or in a chapter in reading order', () => {
    const { data, a, b, c, loose, main, love, ch2, ch3 } = story()
    const [inTime, n] = addBeatInStory(data, { arcId: main, title: 'n' }, { gap: 2 })
    expect(storyOrder(inTime)).toEqual([a, n, b, c, loose])
    expect(inTime.beats[n].chapterId).toBeNull()
    expect(inTime.arcs.find((x) => x.id === main)!.beatIds).toEqual([a, n, c])
    const [inChapter, r] = addBeatInReading(data, { arcId: love, title: 'r' }, { chapterId: ch2, gap: 0 })
    expect(chapterBeats(inChapter)[1]).toEqual([r, c])
    expect(readingOrder(inChapter)).toEqual([a, b, r, c, loose])
    expect(inChapter.arcs.find((x) => x.id === love)!.beatIds).toEqual([b, r, loose])
    const [inEmpty, e] = addBeatInReading(data, { arcId: main, title: 'e' }, { chapterId: ch3, gap: 0 })
    expect(chapterBeats(inEmpty)[2]).toEqual([e])
    expect(inEmpty.arcs.find((x) => x.id === main)!.beatIds).toEqual([a, c, e])
  })

  it('adds a beat at the same moment as others, in either order', () => {
    const { data, a, b, c, loose, love, main, ch2 } = story()
    // In story time: on top of c (in the main arc), a love beat
    const [inTime, n] = addBeatInStory(data, { arcId: love, title: 'n' }, { column: 3 })
    expect(storyColumns(inTime)).toEqual([[a], [b], [c, n], [loose]])
    expect(inTime.beats[n].chapterId).toBeNull()
    // Not on top of a beat of its own arc: just after it instead
    const [after, m] = addBeatInStory(data, { arcId: main, title: 'm' }, { column: 3 })
    expect(storyColumns(after)).toEqual([[a], [b], [c], [m], [loose]])
    // In reading order: next to c in chapter two, at the same time
    const [inChapter, r] = addBeatInReading(data, { arcId: love, title: 'r' }, { chapterId: ch2, column: 0 })
    expect(chapterBeats(inChapter)[1]).toEqual([c, r])
    expect(readingSections(inChapter)[1].columns).toEqual([[c, r]])
  })

  it('moves several beats at once, keeping those on top of each other together', () => {
    let { data, a, b, c, loose, ch1, ch2, ch3 } = story()
    // b and loose (both love) can't both go on top of a column, nor two of one arc
    expect(moveInStory(data, [a, c], { column: 2 })).toBe(data)
    // a and c (main) to the end of story time, in their order
    let next = moveInStory(data, [c, a], { gap: 5 })
    expect(storyColumns(next)).toEqual([[b], [loose], [a], [c]])
    // b on top of c, then both moved before everything: still together
    next = moveInStory(next, b, { column: 4 })
    expect(storyColumns(next)).toEqual([[loose], [a], [c, b]])
    next = moveInStory(next, [b, c], { gap: 1 })
    expect(storyColumns(next)).toEqual([[c, b], [loose], [a]])
    // Only one of a stack moved: it leaves the other behind
    const one = moveInStory(next, c, { gap: 4 })
    expect(storyColumns(one)).toEqual([[b], [loose], [a], [c]])
    expect([one.beats[b], one.beats[c]].some((k) => 'moment' in k)).toBe(false)
    // In reading order: a and loose into the empty third chapter, in reading order
    const read = moveInReading(data, [loose, a], { chapterId: ch3, gap: 0 })
    expect(chapterBeats(read)).toEqual([[b], [c], [a, loose]])
    expect(read.beats[loose].chapterId).toBe(ch3)
    // b and c onto nothing they can share a moment with: loose (love) is b's arc
    expect(moveInReading(data, [b, c], { chapterId: null, column: 0 })).toBe(data)
    // a is c's arc: the two of them can't go on top of c
    expect(moveInReading(data, [a, b], { chapterId: ch2, column: 0 })).toBe(data)
    // b and a beat of a third arc on top of c in chapter two: all at once, read one after another
    let third: string
    let x: string
    ;[data, third] = addArc(data, { name: 'Third', color: '#00f' })
    ;[data, x] = addBeat(data, { arcId: third, title: 'x' })
    const stacked = moveInReading(data, [x, b], { chapterId: ch2, column: 0 })
    expect(chapterBeats(stacked)).toEqual([[a], [c, b, x], []])
    expect(readingSections(stacked)[1].columns).toEqual([[c, b, x]])
    expect(new Set([c, b, x].map((id) => stacked.beats[id].moment)).size).toBe(1)
    void ch1
  })

  it('moves the edge between two chapters in reading order', () => {
    const { data, a, b, c, loose, ch1, ch2, ch3 } = story()
    let next = moveChapterEdge(data, ch1, 1)
    expect(chapterBeats(next)).toEqual([[a], [b, c], []])
    expect(next.beats[b].chapterId).toBe(ch2)
    // Nothing is read in another order
    expect(readingOrder(next)).toEqual(readingOrder(data))
    next = moveChapterEdge(next, ch1, 3)
    expect(chapterBeats(next)).toEqual([[a, b, c], [], []])
    expect(next.beats[c].chapterId).toBe(ch1)
    expect(moveChapterEdge(next, ch1, 3)).toBe(next)
    expect(moveChapterEdge(next, ch1, 9)).toBe(next)
    // The last chapter has no edge with a next one
    expect(moveChapterEdge(next, ch3, 0)).toBe(next)
    // Beats read together cross an edge together
    const stacked = moveInReading(data, loose, { chapterId: ch2, column: 0 })
    expect(readingSections(stacked)[1].columns).toEqual([[c, loose]])
    expect(chapterBeats(moveChapterEdge(stacked, ch1, 3))).toEqual([[a, b, c, loose], [], []])
    expect(moveChapterEdge(stacked, ch1, 2)).toBe(stacked)
  })

  it('adds a chapter at any point: empty between chapters, or split off the one before', () => {
    const { data, a, b, c, ch1, ch2, ch3 } = story()
    // Chapter 1 reads [a], [b]: a new chapter 2 starting at b takes b; the rest move up a number
    let [next, id] = insertChapter(data, 1, 1)
    expect(next.chapters.map((ch) => ch.id)).toEqual([ch1, id, ch2, ch3])
    expect(chapterBeats(next)).toEqual([[a], [b], [c], []])
    expect(next.beats[b].chapterId).toBe(id)
    expect(readingOrder(next)).toEqual(readingOrder(data))
    // An empty one first, and one past the end goes last
    ;[next, id] = insertChapter(data, 0)
    expect(next.chapters.map((ch) => ch.id)).toEqual([id, ch1, ch2, ch3])
    expect(chapterBeats(next)[0]).toEqual([])
    ;[next, id] = insertChapter(data, 99)
    expect(next.chapters[3].id).toBe(id)
    // Split at the very start: the new chapter takes them all; beats read together go together
    const stacked = moveInReading(data, b, { chapterId: ch1, column: 0 })
    ;[next] = insertChapter(stacked, 1, 0)
    expect(chapterBeats(next)).toEqual([[], [a, b], [c], []])
    ;[next] = insertChapter(stacked, 1, 1)
    expect(chapterBeats(next)).toEqual([[a, b], [], [c], []])
  })

  it('puts the chapters in story order, each keeping its share of the book', () => {
    let { data, a, b, c, loose, ch1, ch2 } = story()
    data = moveInStory(data, c, { gap: 1 })
    // Chapters of 2, 1 and 0 beats share the book's 4 (loose was in none)
    const matched = matchStoryOrder(data)
    expect(chapterBeats(matched)).toEqual([[c, a, b], [loose], []])
    expect(matched.beats[loose].chapterId).toBe(ch2)
    expect(matched.beats[c].chapterId).toBe(ch1)
    expect(readingOrder(matched)).toEqual(storyOrder(matched))
    expect(matchStoryOrder(matched)).toBe(matched)
    // A beat before the book begins comes out of its chapter
    const backstory = matchStoryOrder(moveBookMarker(matched, 'start', 2))
    expect(chapterBeats(backstory)).toEqual([[a, b], [loose], []])
    expect(backstory.beats[c].chapterId).toBeNull()
    // Empty chapters share the beats alike; with no chapters there's nothing to do
    let { data: blank, main } = setup()
    const add = (title: string) => ([blank] = addBeat(blank, { arcId: main, title }))
    add('x')
    add('y')
    add('z')
    expect(chapterBeats(matchStoryOrder(blank)).map((ids) => ids.length)).toEqual([1, 1, 1])
    const none = { ...blank, chapters: [] }
    expect(matchStoryOrder(none)).toBe(none)
  })

  it('keeps moments shared by two or more beats when loading', () => {
    const { data, c, loose, a } = story()
    const stacked = moveInStory(data, loose, { column: 3 })
    const moment = stacked.beats[loose].moment
    const loaded = normalizeStory({ ...stacked, beats: { ...stacked.beats, [a]: { ...stacked.beats[a], moment: 'alone' } } })
    expect([loaded.beats[c].moment, loaded.beats[loose].moment]).toEqual([moment, moment])
    expect(loaded.beats[a]).not.toHaveProperty('moment')
    expect(normalizeStory(stacked)).toEqual(stacked)
  })

  it('puts a new beat after everything read before it, leaving flashbacks out of it', () => {
    let { data, a, b, c, loose, ch2, main } = story()
    // c becomes a flashback: read in chapter 2, happened first.
    data = moveInStory(data, c, { gap: 0 })
    expect(timeJumps(storyOrder(data), data.chapters.flatMap((ch) => ch.beatIds)).get(c)).toBe('flashback')
    let d: string
    ;[data, d] = addBeat(data, { arcId: main, title: 'd', chapterId: ch2 })
    // Read after c, but c is a flashback, so d follows b (and a), not c.
    expect(storyOrder(data)).toEqual([c, a, b, d, loose])
    // A deleted beat leaves the timeline.
    data = deleteBeat(data, a)
    expect(data.timeline).not.toContain(a)
    expect(storyOrder(data)).toEqual([c, b, d, loose])
  })

  it('keeps a beat’s “when”, tidied', () => {
    const { data, a } = story()
    expect(updateBeat(data, a, { when: '  Day 3,\nevening ' }).beats[a].when).toBe('  Day 3, evening ')
    expect(updateBeat(data, a, { when: '   ' }).beats[a]).not.toHaveProperty('when')
    const loaded = normalizeStory({ ...moveInStory(updateBeat(data, a, { when: 'Day 3' }), a, { gap: 3 }), timeline: ['nope', a, a] })
    expect(loaded.beats[a].when).toBe('Day 3')
    expect(loaded.timeline).toEqual([a])
    expect(normalizeStory({ title: 'Old' }).timeline).toEqual([])
  })

  it('shows the example story’s flashback', () => {
    const data = buildSampleStory()
    const order = storyOrder(data)
    const first = data.beats[order[0]]
    expect(first.when).toBe('Twenty years earlier')
    const jumps = timeJumps(order, data.chapters.flatMap((c) => c.beatIds))
    expect([...jumps]).toEqual([[order[0], 'flashback']])
    // Chapter 4, added after the timeline was arranged, still comes after chapter 3.
    const chapterOf = (id: string) => data.chapters.findIndex((c) => c.id === data.beats[id].chapterId)
    const placed = order.filter((id) => data.beats[id].chapterId && id !== order[0]).map(chapterOf)
    expect(placed).toEqual([...placed].sort((x, y) => x - y))
  })
})

describe('pictures on the mind map', () => {
  it('keeps picture cards, and drops ones that don’t name a picture', () => {
    const loaded = normalizeStory({
      mindMaps: [
        {
          id: 'map_main',
          name: 'Map',
          nodes: [
            { id: 'p1', kind: 'image', imageId: 'img_abc123', x: 10, y: 20, width: 300, height: 200 },
            { id: 'p2', kind: 'image', imageId: 'not a picture', x: 0, y: 0, width: 10, height: 10 },
            { id: 'p3', kind: 'image', imageId: 'img_def', x: 0, y: 0 },
          ],
          edges: [{ id: 'e1', source: 'p1', target: 'p3', label: '', arrow: false }],
        },
      ],
    })
    const nodes = loaded.mindMaps[0].nodes
    expect(nodes.map((n) => n.id)).toEqual(['p1', 'p3'])
    expect(nodes[0]).toEqual({ id: 'p1', kind: 'image', imageId: 'img_abc123', x: 10, y: 20, width: 300, height: 200 })
    expect(nodes[1]).toMatchObject({ width: 240, height: 180 })
    expect(loaded.mindMaps[0].edges).toHaveLength(1)
  })
})

describe('portraits', () => {
  it('gives characters and elements a portrait, and takes it away', () => {
    let data = emptyStory()
    let mara: string
    let lighthouse: string
    ;[data, mara] = addCharacter(data, { name: 'Mara', color: '#2a9d8f' })
    ;[data, lighthouse] = addElement(data, { name: 'Lighthouse', kind: 'place', color: '#457b9d' })
    data = setPortrait(data, mara, 'img_mara1')
    data = setPortrait(data, lighthouse, 'img_light1')
    expect(data.characters[0].portrait).toBe('img_mara1')
    expect(data.elements[0].portrait).toBe('img_light1')
    // Mentions hand the portrait on to badges
    expect(mentionables(data).map((m) => (m as { portrait?: string }).portrait)).toEqual(['img_mara1', 'img_light1'])
    expect(setPortrait(data, mara, 'not a picture')).toBe(data)
    data = setPortrait(data, mara, null)
    expect('portrait' in data.characters[0]).toBe(false)
    expect(data.elements[0].portrait).toBe('img_light1')
  })

  it('keeps portraits when loading, dropping ones that aren’t picture ids', () => {
    const loaded = normalizeStory({
      characters: [
        { id: 'chr_a', name: 'A', color: '#111111', portrait: 'img_abc' },
        { id: 'chr_b', name: 'B', color: '#111111', portrait: 'http://example.com/b.png' },
      ],
      elements: [{ id: 'elm_c', kind: 'place', name: 'C', color: '#111111', portrait: 'img_def' }],
    })
    expect(loaded.characters[0].portrait).toBe('img_abc')
    expect('portrait' in loaded.characters[1]).toBe(false)
    expect(loaded.elements[0].portrait).toBe('img_def')
    expect(normalizeStory(loaded)).toEqual(loaded)
  })
})

describe('copy and paste on the map', () => {
  it('pastes copied cards and the lines between them, with new ids, moved over', () => {
    const data = buildSampleStory()
    const map = data.mindMaps[0]
    const [a, b] = map.nodes.filter((n) => n.kind === 'character')
    const line = map.edges.find((e) => [a.id, b.id].includes(e.source) && [a.id, b.id].includes(e.target))
    const copied = { nodes: [a, b], edges: line ? [line] : [] }
    let n = 0
    const [next, ids] = pasteMapItems(data, map.id, copied, { x: 32, y: 32 }, () => `node_new${++n}`)
    expect(ids).toEqual(['node_new1', 'node_new2'])
    const after = next.mindMaps[0]
    expect(after.nodes).toHaveLength(map.nodes.length + 2)
    const pasted = after.nodes.slice(-2)
    expect(pasted.map((p) => [p.x, p.y])).toEqual([
      [a.x + 32, a.y + 32],
      [b.x + 32, b.y + 32],
    ])
    expect(pasted.map((p) => ('refId' in p ? p.refId : null))).toEqual([
      'refId' in a ? a.refId : null,
      'refId' in b ? b.refId : null,
    ])
    if (line) {
      const added = after.edges.at(-1)!
      expect(added.id).not.toBe(line.id)
      expect([added.source, added.target].sort()).toEqual(['node_new1', 'node_new2'])
      expect(added.label).toBe(line.label)
    }
  })

  it('leaves out cards for things the story doesn’t have, and garbage', () => {
    const data = emptyStory()
    const mapId = data.mindMaps[0].id
    const [next, ids] = pasteMapItems(
      data,
      mapId,
      {
        nodes: [
          { id: 'x1', kind: 'character', refId: 'chr_gone', x: 0, y: 0 },
          { id: 'x2', kind: 'note', x: 10, y: 10, width: 200, height: 100, text: 'Keep me', color: 'pink', size: 22 },
          'nonsense',
        ],
        edges: [{ id: 'e', source: 'x1', target: 'x2', label: '', arrow: false }],
      },
      { x: 0, y: 0 },
    )
    expect(ids).toHaveLength(1)
    expect(next.mindMaps[0].nodes[0]).toMatchObject({ kind: 'note', text: 'Keep me', color: '#f9c9d9', size: 22, x: 10, y: 10 })
    expect(next.mindMaps[0].edges).toHaveLength(0)
    expect(pasteMapItems(data, mapId, { nodes: 'junk' }, { x: 0, y: 0 })).toEqual([data, []])
  })
})

describe('containers on the map', () => {
  const setup = () => {
    let data = emptyStory()
    const mapId = data.mindMaps[0].id
    const add = (node: Parameters<typeof addMapNode>[1], before?: string | null) => {
      const [next, id] = addMapNode(data, node, mapId, before)
      data = next
      return id!
    }
    const box = add({ kind: 'container', x: 0, y: 0, title: 'Suspects', width: 300, height: 200, color: '#c7dcf7', layout: 'vertical' })
    const a = add({ kind: 'note', x: 10, y: 10, width: 100, height: 80, text: 'A', color: '#fbe7a1', containerId: box })
    const b = add({ kind: 'note', x: 10, y: 100, width: 100, height: 80, text: 'B', color: '#fbe7a1', containerId: box })
    const c = add({ kind: 'note', x: 500, y: 0, width: 100, height: 80, text: 'C', color: '#fbe7a1' })
    return { get data() { return data }, set data(d) { data = d }, add, mapId, box, a, b, c }
  }
  const order = (data: StoryData, box: string) =>
    data.mindMaps[0].nodes.filter((n) => parentOf(n) === box).map((n) => ('text' in n ? n.text : n.id))

  it('puts cards on a container, in order, and ignores ones that aren’t containers', () => {
    const t = setup()
    expect(order(t.data, t.box)).toEqual(['A', 'B'])
    const first = t.add({ kind: 'note', x: 0, y: 0, width: 100, height: 80, text: 'Z', color: 'pink', containerId: t.box }, t.a)
    expect(order(t.data, t.box)).toEqual(['Z', 'A', 'B'])
    const stray = t.add({ kind: 'note', x: 0, y: 0, width: 100, height: 80, text: 'Q', color: 'pink', containerId: t.c })
    expect(parentOf(t.data.mindMaps[0].nodes.find((n) => n.id === stray)!)).toBeUndefined()
    expect(first).toBeTruthy()
  })

  it('drops cards onto, along and off a container', () => {
    const t = setup()
    t.data = dropMapNodes(t.data, [{ id: t.c, x: 20, y: 0, containerId: t.box, before: t.a }])
    expect(order(t.data, t.box)).toEqual(['C', 'A', 'B'])
    t.data = dropMapNodes(t.data, [{ id: t.c, x: 20, y: 300, before: null }])
    expect(order(t.data, t.box)).toEqual(['A', 'B', 'C'])
    t.data = dropMapNodes(t.data, [{ id: t.a, x: 900, y: 900, containerId: null }])
    expect(order(t.data, t.box)).toEqual(['B', 'C'])
    expect(t.data.mindMaps[0].nodes.find((n) => n.id === t.a)).toMatchObject({ x: 900, y: 900 })
    // A container never goes on itself
    t.data = dropMapNodes(t.data, [{ id: t.box, x: 5, y: 5, containerId: t.box }])
    expect(parentOf(t.data.mindMaps[0].nodes.find((n) => n.id === t.box)!)).toBeUndefined()
  })

  it('puts cards in a grid in reading order: by row, then across', () => {
    const t = setup()
    const d = t.add({ kind: 'note', x: 0, y: 0, width: 100, height: 80, text: 'D', color: '#fbe7a1', containerId: t.box })
    t.data = setContainerLayout(t.data, t.box, 'free', {
      [t.a]: { x: 200, y: 100 },
      [t.b]: { x: 20, y: 102 },
      [d]: { x: 120, y: 10 },
    })
    t.data = setContainerLayout(t.data, t.box, 'grid')
    expect(order(t.data, t.box)).toEqual(['D', 'B', 'A'])
  })

  it('stacks cards in the order they’re in on screen when it stops being freeform', () => {
    const t = setup()
    t.data = setContainerLayout(t.data, t.box, 'free', { [t.a]: { x: 40, y: 150 }, [t.b]: { x: 40, y: 20 } })
    expect(t.data.mindMaps[0].nodes.find((n) => n.id === t.box)).toMatchObject({ layout: 'free' })
    expect(t.data.mindMaps[0].nodes.find((n) => n.id === t.a)).toMatchObject({ x: 40, y: 150 })
    expect(order(t.data, t.box)).toEqual(['A', 'B'])
    t.data = setContainerLayout(t.data, t.box, 'vertical')
    expect(order(t.data, t.box)).toEqual(['B', 'A'])
  })

  it('leaves a removed container’s cards on the map, where they were shown', () => {
    const t = setup()
    t.data = removeMapNodes(t.data, [t.box], { [t.a]: { x: 16, y: 16 } })
    const nodes = t.data.mindMaps[0].nodes
    expect(nodes.map((n) => n.id)).toEqual([t.a, t.b, t.c])
    expect(nodes.every((n) => parentOf(n) === undefined)).toBe(true)
    expect(nodes[0]).toMatchObject({ x: 16, y: 16 })
  })

  it('pastes a container with its cards, and loads them back', () => {
    const t = setup()
    const copied = { nodes: t.data.mindMaps[0].nodes.filter((n) => n.id !== t.c), edges: [] }
    const [next, ids] = pasteMapItems(t.data, t.mapId, copied, { x: 40, y: 40 })
    const pasted = next.mindMaps[0].nodes.filter((n) => ids.includes(n.id))
    expect(pasted.map((n) => n.kind)).toEqual(['container', 'note', 'note'])
    expect(pasted.slice(1).map(parentOf)).toEqual([ids[0], ids[0]])
    expect(normalizeStory(next)).toEqual(next)
  })

  it('puts containers on containers, and takes the cards of one that goes out to the one it was on', () => {
    const t = setup()
    const [withOuter, outer] = addMapNode(t.data, { kind: 'container', x: 1000, y: 1000, title: 'Outer', width: 600, height: 400, color: '#cfe9c8', layout: 'free' }, t.mapId)
    t.data = dropMapNodes(withOuter, [{ id: t.box, x: 40, y: 60, containerId: outer }])
    expect(parentOf(t.data.mindMaps[0].nodes.find((n) => n.id === t.box)!)).toBe(outer)
    // The outer one can't go onto the inner one: that would go round in a circle
    t.data = dropMapNodes(t.data, [{ id: outer!, x: 0, y: 0, containerId: t.box }])
    expect(parentOf(t.data.mindMaps[0].nodes.find((n) => n.id === outer)!)).toBeUndefined()
    // Nor can two containers dropped at once go onto each other
    const [withThird, third] = addMapNode(t.data, { kind: 'container', x: 0, y: 900, title: '', width: 200, height: 200, color: '#cfe9c8', layout: 'free' }, t.mapId)
    const both = dropMapNodes(withThird, [
      { id: outer!, x: 0, y: 0, containerId: third },
      { id: third!, x: 0, y: 0, containerId: outer },
    ]).mindMaps[0].nodes
    expect([outer, third].map((id) => parentOf(both.find((n) => n.id === id)!))).toEqual([third, undefined])
    // Removing the inner one: its cards go onto the outer one, still where they were
    t.data = removeMapNodes(t.data, [t.box])
    const a = t.data.mindMaps[0].nodes.find((n) => n.id === t.a)!
    expect(parentOf(a)).toBe(outer)
    expect([a.x, a.y]).toEqual([40 + 10, 60 + 10])
  })

  it('loads containers on containers, breaks circles, and moves old cards’ places to be from their container', () => {
    const loaded = normalizeStory({
      mindMap: {
        nodes: [
          { id: 'c1', kind: 'container', x: 100, y: 50, width: 400, height: 300, color: 'blue', layout: 'free' },
          { id: 'old', kind: 'note', x: 130, y: 90, width: 100, height: 80, text: '', color: 'yellow', parentId: 'c1' },
          { id: 'c2', kind: 'container', x: 0, y: 0, width: 400, height: 300, color: 'blue', layout: 'free', containerId: 'c3' },
          { id: 'c3', kind: 'container', x: 0, y: 0, width: 400, height: 300, color: 'blue', layout: 'free', containerId: 'c2' },
          { id: 'c4', kind: 'container', x: 20, y: 60, width: 100, height: 100, color: 'blue', layout: 'grid', containerId: 'c1' },
        ],
      },
    })
    const byId = Object.fromEntries(loaded.mindMaps[0].nodes.map((n) => [n.id, n]))
    expect(byId.old).toMatchObject({ containerId: 'c1', x: 30, y: 40 })
    expect('parentId' in byId.old).toBe(false)
    expect([parentOf(byId.c2), parentOf(byId.c3)].filter(Boolean)).toHaveLength(1)
    expect(parentOf(byId.c4)).toBe('c1')
    expect(normalizeStory(loaded)).toEqual(loaded)
  })

  it('repairs containers and what’s on them when loading', () => {
    const loaded = normalizeStory({
      mindMap: {
        nodes: [
          { id: 'box', kind: 'container', x: 0, y: 0, width: 5, height: 'tall', color: 'neon', layout: 'diagonal', parentId: 'box2' },
          { id: 'box2', kind: 'container', x: 0, y: 0, width: 400, height: 300, color: 'green', layout: 'grid', title: 'The harbour' },
          { id: 'n1', kind: 'note', x: 0, y: 0, width: 100, height: 80, text: '', color: 'yellow', parentId: 'box' },
          { id: 'n2', kind: 'note', x: 0, y: 0, width: 100, height: 80, text: '', color: 'yellow', parentId: 'n1' },
          { id: 'n3', kind: 'note', x: 0, y: 0, width: 100, height: 80, text: '', color: 'yellow', parentId: 'gone' },
        ],
      },
    })
    const [box, box2, n1, n2, n3] = loaded.mindMaps[0].nodes
    expect(box).toEqual({ id: 'box', kind: 'container', x: 0, y: 0, title: '', width: 80, height: 260, color: '#c7dcf7', layout: 'vertical' })
    expect(box2).toMatchObject({ color: '#cfe9c8', layout: 'grid', title: 'The harbour' })
    expect([n1, n2, n3].map(parentOf)).toEqual(['box', undefined, undefined])
  })
})
