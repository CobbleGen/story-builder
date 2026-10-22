import { describe, expect, it } from 'vitest'
import type { ArchiveKind, RichNode, StoryData } from '../types'
import * as ops from './storyOps'
import { archiveItem, deleteArchived, reinsert, restoreArchived, throughArchive } from './archive'
import { buildSampleStory } from './sampleStory'
import { archivedNamed, archivedOutlineWords } from '../lib/archived'
import { manuscriptWords, outlineWords } from '../lib/progress'
import { mentionToken } from '../lib/mentions'
import { restore } from './history'

const sample = () => buildSampleStory()
const AT = 1_700_000_000_000

/** Every beat is in its arc list once and, if placed, in its chapter list once. */
function expectConsistent(data: StoryData) {
  for (const beat of Object.values(data.beats)) {
    expect(data.arcs.filter((a) => a.beatIds.includes(beat.id)).map((a) => a.id)).toEqual([beat.arcId])
    expect(data.chapters.filter((c) => c.beatIds.includes(beat.id)).map((c) => c.id)).toEqual(beat.chapterId ? [beat.chapterId] : [])
  }
  for (const id of [...data.arcs.flatMap((a) => a.beatIds), ...data.chapters.flatMap((c) => c.beatIds), ...data.timeline]) {
    if (!id.startsWith('book:')) expect(data.beats[id]).toBeDefined()
  }
  for (const map of data.mindMaps) {
    for (const n of map.nodes) {
      if (!('refId' in n)) continue
      const exists = {
        arc: data.arcs.some((a) => a.id === n.refId),
        chapter: data.chapters.some((c) => c.id === n.refId),
        character: data.characters.some((c) => c.id === n.refId),
        element: data.elements.some((e) => e.id === n.refId),
        beat: !!data.beats[n.refId],
      }[n.kind]
      expect(exists).toBe(true)
    }
    const ids = new Set(map.nodes.map((n) => n.id))
    for (const e of map.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true)
  }
}

const doc = (...paragraphs: RichNode[][]): RichNode => ({ type: 'doc', content: paragraphs.map((content) => ({ type: 'paragraph', content })) })
const text = (t: string): RichNode => ({ type: 'text', text: t })

describe('reinsert', () => {
  it('puts ids back after the nearest one before them that is still there', () => {
    expect(reinsert(['a', 'c'], ['b'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(reinsert(['c', 'a'], ['b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b'])
    expect(reinsert(['c'], ['a', 'b'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(reinsert([], ['b', 'a'], ['a', 'b'])).toEqual(['a', 'b'])
    expect(reinsert(['x'], ['n'], [])).toEqual(['x', 'n'])
  })
})

describe('archiving', () => {
  it('takes a chapter out with its text and beats, and brings it back as it was', () => {
    const data = sample()
    const chapter = data.chapters[1]
    const beats = chapter.beatIds
    expect(beats.length).toBeGreaterThan(0)
    const archived = archiveItem(data, 'chapter', chapter.id, AT)
    expect(archived.chapters.some((c) => c.id === chapter.id)).toBe(false)
    expect(archived.texts[chapter.id]).toBeUndefined()
    for (const b of beats) {
      expect(archived.beats[b]).toBeUndefined()
      expect(archived.timeline).not.toContain(b)
    }
    expectConsistent(archived)
    expect(archived.archive).toHaveLength(1)
    expect(archived.archive[0]).toMatchObject({ kind: 'chapter', id: chapter.id, at: AT })
    expect(archived.archive[0].beats.map((b) => b.id)).toEqual(beats)
    // Out of the word count, but not the outline's tally.
    expect(manuscriptWords(archived)).toBe(manuscriptWords(data) - (data.texts[chapter.id]?.words ?? 0))
    expect(ops.logOutline(data, archived, '2026-01-01')).toBe(archived)

    const back = restoreArchived(archived, chapter.id)
    expect(back.archive).toEqual([])
    expect(back).toEqual(data)
  })

  it('brings back every thing in the sample story where it was', () => {
    const data = sample()
    const things: [ArchiveKind, string][] = [
      ...data.chapters.map((c) => ['chapter', c.id] as [ArchiveKind, string]),
      ...data.arcs.map((a) => ['arc', a.id] as [ArchiveKind, string]),
      ...Object.keys(data.beats).map((b) => ['beat', b] as [ArchiveKind, string]),
      ...data.characters.map((c) => ['character', c.id] as [ArchiveKind, string]),
      ...data.elements.map((e) => ['element', e.id] as [ArchiveKind, string]),
      ...data.mindMaps.map((m) => ['map', m.id] as [ArchiveKind, string]),
    ]
    for (const [kind, id] of things) {
      const archived = archiveItem(data, kind, id, AT)
      expect(archived.archive).toHaveLength(1)
      expectConsistent(archived)
      expect(restoreArchived(archived, id)).toEqual(data)
    }
  })

  it('brings back several things in any order', () => {
    const data = sample()
    const [arc] = data.arcs
    const beat = data.beats[data.arcs[1].beatIds[0]]
    const chapter = data.chapters.find((c) => c.beatIds.length && c.id !== beat.chapterId)!
    const character = data.characters[0]
    let archived = archiveItem(data, 'beat', beat.id, AT)
    archived = archiveItem(archived, 'chapter', chapter.id, AT + 1)
    archived = archiveItem(archived, 'arc', arc.id, AT + 2)
    archived = archiveItem(archived, 'character', character.id, AT + 3)
    expectConsistent(archived)
    const ids = [beat.id, chapter.id, arc.id, character.id]
    const orders = [ids, [...ids].reverse(), [ids[1], ids[3], ids[0], ids[2]], [ids[2], ids[0], ids[3], ids[1]]]
    for (const order of orders) {
      let back = archived
      for (const id of order) {
        back = restoreArchived(back, id)
        expectConsistent(back)
      }
      expect(back).toEqual(data)
    }
  })

  it('takes a character out of arcs, chapters’ POV and the maps; their mentions still read as their name', () => {
    let data = sample()
    const character = data.characters.find((c) => data.chapters.some((ch) => ch.povCharacterId === c.id))!
    ;[data] = ops.addMapNode(data, { kind: 'character', refId: character.id, x: 0, y: 0 })
    const archived = archiveItem(data, 'character', character.id, AT)
    expect(archived.chapters.some((c) => c.povCharacterId === character.id)).toBe(false)
    expect(archived.arcs.some((a) => a.characterIds.includes(character.id))).toBe(false)
    expect(archived.mindMaps.some((m) => m.nodes.some((n) => 'refId' in n && n.refId === character.id))).toBe(false)
    expect(archivedNamed(archived).map((c) => c.id)).toEqual([character.id])
    expect(ops.mentionables(archived).some((c) => c.id === character.id)).toBe(false)
    expect(restoreArchived(archived, character.id)).toEqual(data)
  })

  it('archives the last map with an empty one standing in, gone again when it’s back', () => {
    let data = ops.emptyStory()
    ;[data] = ops.addMapNode(data, { kind: 'note', x: 0, y: 0, width: 100, height: 100, text: 'Hi', color: '#ffffff' } as never)
    const map = data.mindMaps[0]
    const archived = archiveItem(data, 'map', map.id, AT)
    expect(archived.mindMaps).toHaveLength(1)
    expect(archived.mindMaps[0].id).not.toBe(map.id)
    expect(archived.mindMaps[0].nodes).toEqual([])
    expect(restoreArchived(archived, map.id)).toEqual(data)
  })

  it('brings back a beat whose chapter is archived in no chapter, and the chapter takes it back later', () => {
    const data = sample()
    const chapter = data.chapters.find((c) => c.beatIds.length >= 2)!
    const [beat] = chapter.beatIds
    let archived = archiveItem(data, 'beat', beat, AT)
    archived = archiveItem(archived, 'chapter', chapter.id, AT + 1)
    const beatBack = restoreArchived(archived, beat)
    expectConsistent(beatBack)
    expect(beatBack.beats[beat].chapterId).toBeNull()
    expect(beatBack.archive.map((a) => a.id)).toEqual([chapter.id])
    expect(restoreArchived(beatBack, chapter.id)).toEqual(data)
  })

  it('brings back a beat whose arc is archived with its arc', () => {
    const data = sample()
    const arc = data.arcs.find((a) => a.beatIds.length >= 2)!
    let archived = archiveItem(data, 'beat', arc.beatIds[0], AT)
    archived = archiveItem(archived, 'arc', arc.id, AT + 1)
    const back = restoreArchived(archived, arc.beatIds[0])
    expect(back.archive).toEqual([])
    expect(back).toEqual(data)
  })

  it('keeps beats of an arc archived after their chapter with the arc', () => {
    const data = sample()
    const chapter = data.chapters.find((c) => new Set(c.beatIds.map((b) => data.beats[b].arcId)).size >= 2)!
    const arcId = data.beats[chapter.beatIds[0]].arcId
    let archived = archiveItem(data, 'chapter', chapter.id, AT)
    archived = archiveItem(archived, 'arc', arcId, AT + 1)
    const chapterBack = restoreArchived(archived, chapter.id)
    expectConsistent(chapterBack)
    const back = chapterBack.chapters.find((c) => c.id === chapter.id)!
    expect(back.beatIds).toEqual(chapter.beatIds.filter((b) => data.beats[b].arcId !== arcId))
    expect(restoreArchived(chapterBack, arcId)).toEqual(data)
  })

  it('does nothing for something that isn’t there', () => {
    const data = sample()
    expect(archiveItem(data, 'chapter', 'nope', AT)).toBe(data)
    expect(restoreArchived(data, 'nope')).toBe(data)
  })
})

describe('deleting', () => {
  it('deletes an archived chapter for good with its beats', () => {
    const data = sample()
    const chapter = data.chapters.find((c) => c.beatIds.length)!
    const archived = archiveItem(data, 'chapter', chapter.id, AT)
    const gone = deleteArchived(archived, chapter.id, ops)
    expect(gone.archive).toEqual([])
    expect(gone.chapters.some((c) => c.id === chapter.id)).toBe(false)
    for (const b of chapter.beatIds) expect(gone.beats[b]).toBeUndefined()
    expectConsistent(gone)
    // Deleting is cutting from the outline.
    const logged = ops.logOutline(archived, gone, '2026-01-01')
    expect(logged.outlineCuts['2026-01-01']).toBeGreaterThan(0)
  })

  it('unmentions a character deleted for good, in archived chapters too', () => {
    let data = sample()
    const character = data.characters[0]
    const chapter = data.chapters[0]
    data = ops.setChapterText(
      data,
      chapter.id,
      { doc: doc([text('Hello '), { type: 'mention', attrs: { id: character.id, label: character.name } }]), words: 2, updatedAt: AT },
      null,
    )
    data = ops.updateChapter(data, data.chapters[1].id, { summary: `With ${mentionToken(character.id)}` })
    let archived = archiveItem(data, 'chapter', chapter.id, AT)
    archived = archiveItem(archived, 'character', character.id, AT + 1)
    const gone = deleteArchived(archived, character.id, ops)
    expect(gone.archive.map((a) => a.id)).toEqual([chapter.id])
    expect(gone.chapters[0].summary).toBe(`With ${character.name}`)
    expect(JSON.stringify(gone.archive[0].texts[chapter.id].doc)).not.toContain(character.id)
    expect(JSON.stringify(gone.archive[0].texts[chapter.id].doc)).toContain(character.name)
  })

  it('takes archived beats of an arc deleted in the story with it', () => {
    const data = sample()
    const arc = data.arcs.find((a) => a.beatIds.length >= 2)!
    const archived = archiveItem(data, 'beat', arc.beatIds[0], AT)
    const gone = throughArchive(archived, (d) => ops.deleteArc(d, arc.id))
    expect(gone.archive).toEqual([])
    expect(gone.arcs.some((a) => a.id === arc.id)).toBe(false)
    expectConsistent(gone)
  })

  it('leaves the rest as it was when deleting through the archive', () => {
    const data = sample()
    const archived = archiveItem(data, 'chapter', data.chapters[0].id, AT)
    const extra = data.elements[0].id
    const gone = throughArchive(archived, (d) => ops.deleteElement(d, extra))
    expect(gone.chapters).toBe(archived.chapters)
    expect(gone.timeline).toBe(archived.timeline)
    expect(gone.archive).toHaveLength(1)
  })
})

describe('saving', () => {
  it('keeps the archive through a save, and leaves out what isn’t right', () => {
    const data = archiveItem(archiveItem(sample(), 'chapter', sample().chapters[0].id, AT), 'map', sample().mindMaps[0].id, AT + 1)
    const saved = JSON.parse(JSON.stringify(data))
    expect(ops.normalizeStory(saved)).toEqual(data)
    saved.archive.push({ kind: 'chapter', id: 'ch_missing' }, { kind: 'nonsense', id: 'x' }, 'garbage', null)
    expect(ops.normalizeStory(saved).archive).toEqual(data.archive)
    expect(ops.normalizeStory({ ...saved, archive: 'nope' }).archive).toEqual([])
  })

  it('counts archived outline words apart', () => {
    const data = sample()
    const arc = data.arcs[0]
    const archived = archiveItem(data, 'arc', arc.id, AT)
    expect(outlineWords(archived).total + archivedOutlineWords(archived)).toBe(outlineWords(data).total)
  })

  it('keeps a chapter’s text written since, when undoing brings back the archive as it was', () => {
    const data = sample()
    const chapter = data.chapters[0]
    const archived = archiveItem(data, 'chapter', chapter.id, AT)
    const back = restoreArchived(archived, chapter.id)
    const written = { doc: doc([text('New words')]), words: 2, updatedAt: AT + 10_000 }
    const now = { ...back, texts: { ...back.texts, [chapter.id]: written } }
    // Undoing the restore (the copy has it archived): the archived text is the one written since.
    const undone = restore(archived, now, AT + 5_000)
    expect(undone.archive[0].texts[chapter.id]).toBe(written)
  })
})
