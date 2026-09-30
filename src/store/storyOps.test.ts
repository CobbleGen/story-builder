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
  normalizeStory,
  emptyStory,
  setGoals,
  placeBeat,
  setBeatArc,
} from './storyOps'
import { buildSampleStory } from './sampleStory'
import { lookupOf, mentionToken, toDisplay } from '../lib/mentions'

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
    expect(data.mindMap.nodes[0]).toMatchObject({ x: 50, y: 60 })
    data = removeMapNodes(data, [a!])
    expect(data.mindMap.nodes.map((n) => n.id)).toEqual([b])
    expect(data.mindMap.edges).toEqual([])
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
    expect(data.mindMap.nodes.map((n) => n.id)).toEqual([nBeat, nArc])
    expect(data.mindMap.edges).toEqual([])
    data = deleteArc(data, main)
    expect(data.mindMap.nodes).toEqual([])
  })

  it('follows renames in notes and turns deleted characters into plain names', () => {
    let { data } = setup()
    let mara: string, note: string | null
    ;[data, mara] = addCharacter(data, { name: 'Mara', color: '#0a0' })
    ;[data, note] = addMapNode(data, {
      kind: 'note', x: 0, y: 0, width: 200, height: 150, color: 'pink', text: `Ask ${mentionToken(mara)}`,
    })
    data = deleteCharacter(data, mara)
    expect(data.mindMap.nodes.find((n) => n.id === note)).toMatchObject({ text: 'Ask Mara' })
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
    expect(withLine.mindMap.edges[0]).toMatchObject({ id: line, sourceAnchor: `beat:${beat}`, targetAnchor: `attr:${attr}` })
    // The same line again (either way round) is a repeat; card to card is a different line.
    expect(addMapEdge(withLine, maraCard!, arcCard!, { source: `attr:${attr}`, target: `beat:${beat}` })[1]).toBeNull()
    expect(addMapEdge(withLine, arcCard!, maraCard!)[1]).not.toBeNull()
    // Two spots in one card can be joined; a card can't be joined to itself.
    expect(addMapEdge(withLine, arcCard!, arcCard!, { source: `beat:${beat}`, target: 'beat:other' })[1]).not.toBeNull()
    expect(addMapEdge(withLine, arcCard!, arcCard!)[1]).toBeNull()
    expect(addMapEdge(withLine, arcCard!, arcCard!, { source: `beat:${beat}`, target: `beat:${beat}` })[1]).toBeNull()
    // Deleting the attribute or the beat takes the line with it; the cards stay.
    expect(deleteAttribute(withLine, mara, attr).mindMap.edges).toEqual([])
    expect(deleteBeat(withLine, beat).mindMap.edges).toEqual([])
    expect(deleteCharacter(withLine, mara).mindMap.edges).toEqual([])
    expect(deleteBeat(withLine, beat).mindMap.nodes).toHaveLength(2)
    // Anchors survive a reload.
    expect(normalizeStory(withLine).mindMap.edges[0]).toMatchObject({ sourceAnchor: `beat:${beat}`, targetAnchor: `attr:${attr}` })
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
    expect(data.mindMap.nodes.map((n) => n.id)).toEqual(['n1', 'n3'])
    expect(data.mindMap.nodes[0]).toMatchObject({ x: 10, y: 0 })
    expect(data.mindMap.nodes[1]).toMatchObject({ color: 'yellow', width: 220, height: 160 })
    expect(data.mindMap.edges).toEqual([{ id: 'e1', source: 'n1', target: 'n3', label: 'why', arrow: false }])
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
    const [chapter, arc, badArc, list, plain, sized, note, character] = data.mindMap.nodes
    expect(sized).toMatchObject({ expanded: 'beats', sizes: { text: { width: 500, height: 4000 } } })
    expect(sized).not.toHaveProperty('sizes.beats')
    expect(sized).not.toHaveProperty('sizes.details')
    expect(note).toMatchObject({ color: 'white', list: 'bullet', checked: [0] })
    expect(character).toMatchObject({ expanded: 'details' })
    expect(chapter).toMatchObject({ expanded: 'text' })
    expect(arc).toMatchObject({ expanded: 'beats' })
    expect(badArc).not.toHaveProperty('expanded')
    expect(list).toMatchObject({ bg: 'green', list: 'check', checked: [1] })
    expect(plain).not.toHaveProperty('bg')
    expect(plain).not.toHaveProperty('list')
    expect(plain).not.toHaveProperty('checked')
  })
})
