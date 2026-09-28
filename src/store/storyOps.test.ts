import { describe, expect, it } from 'vitest'
import type { StoryData } from '../types'
import {
  addAttribute,
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
  placeBeat,
  setBeatArc,
} from './storyOps'
import { buildSampleStory } from './sampleStory'
import { lookupOf, mentionToken, toDisplay } from '../lib/mentions'

function setup() {
  let data: StoryData = { title: 'Test', chapters: [], arcs: [], beats: {}, characters: [] }
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
    expect(normalizeStory('nope')).toEqual({ title: 'Untitled story', arcs: [], chapters: [], beats: {}, characters: [] })
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
