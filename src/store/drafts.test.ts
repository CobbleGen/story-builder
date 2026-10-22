import { describe, expect, it } from 'vitest'
import type { RichNode, StoryData } from '../types'
import * as ops from './storyOps'
import { deleteDraft, moveDraft, newDraft, renameDraft, switchDraft } from './drafts'
import { archiveItem, restoreArchived, throughArchive, upgradeStory } from './archive'
import { buildSampleStory } from './sampleStory'
import { DEFAULT_DRAFT_ID, draftHaving, idsElsewhere, nextDraftName } from '../lib/drafts'
import { archiveHere } from '../lib/archived'
import { mentionToken } from '../lib/mentions'

const AT = 1_700_000_000_000
const doc = (text: string, extra: RichNode[] = []): RichNode => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }, ...extra] }] })

describe('drafts', () => {
  it('starts with one, the first draft, open', () => {
    const data = ops.emptyStory()
    expect(data.drafts).toEqual([{ id: DEFAULT_DRAFT_ID, name: 'First draft', createdAt: 0 }])
    expect(data.draft).toBe(DEFAULT_DRAFT_ID)
    // A save from before drafts is one draft.
    const old = ops.normalizeStory({ title: 'Old', chapters: [{ id: 'c1', title: 'One' }] })
    expect(old.drafts).toEqual([{ id: DEFAULT_DRAFT_ID, name: 'First draft', createdAt: 0 }])
    expect(old.chapters.map((c) => c.id)).toEqual(['c1'])
  })

  it('copies the open draft into a new one, opened, the first one kept as it was', () => {
    const data = buildSampleStory()
    const [copy, id] = newDraft(data, { copy: true, at: AT })
    expect(copy.draft).toBe(id)
    expect(copy.drafts.map((d) => d.name)).toEqual(['First draft', 'Second draft'])
    expect(copy.drafts[1]).toEqual({ id, name: 'Second draft', createdAt: AT })
    // The same book, with the same ids: links, mentions and map cards work in both.
    expect(copy.chapters).toBe(data.chapters)
    expect(copy.drafts[0].book).toEqual({ chapters: data.chapters, arcs: data.arcs, beats: data.beats, texts: data.texts, timeline: data.timeline })
    // Changing the copy leaves the first draft be.
    let changed = ops.updateChapter(copy, copy.chapters[0].id, { title: 'A new opening' })
    changed = ops.deleteBeat(changed, Object.keys(changed.beats)[0])
    changed = ops.setChapterText(changed, changed.chapters[0].id, { doc: doc('Rewritten.'), words: 1, updatedAt: AT }, null)
    const back = switchDraft(changed, DEFAULT_DRAFT_ID)
    expect(back.draft).toBe(DEFAULT_DRAFT_ID)
    expect({ ...back, drafts: data.drafts, draft: data.draft }).toEqual(data)
    expect(back.drafts[1].book!.chapters[0].title).toBe('A new opening')
    // And back again.
    const again = switchDraft(back, id)
    expect(again.chapters[0].title).toBe('A new opening')
    expect(again.drafts[1]).not.toHaveProperty('book')
  })

  it('starts a blank draft', () => {
    const data = buildSampleStory()
    const [blank] = newDraft(data, { copy: false, name: 'From scratch' })
    expect(blank.chapters).toEqual([])
    expect(blank.arcs).toEqual([])
    expect(blank.beats).toEqual({})
    expect(blank.texts).toEqual({})
    expect(blank.timeline).toEqual([])
    // The story's world is every draft's.
    expect(blank.characters).toBe(data.characters)
    expect(blank.mindMaps).toBe(data.mindMaps)
    expect(blank.drafts[1].name).toBe('From scratch')
  })

  it('is kept through a save, each draft’s book made right', () => {
    const [data] = newDraft(buildSampleStory(), { copy: true })
    expect(ops.normalizeStory(JSON.parse(JSON.stringify(data)))).toEqual(data)
    // A stored draft's broken link is mended as the open one's would be.
    const saved = JSON.parse(JSON.stringify(data)) as StoryData
    const book = saved.drafts[0].book!
    book.chapters[0].beatIds.push('beat_nowhere')
    expect(ops.normalizeStory(saved).drafts[0].book!.chapters[0].beatIds).not.toContain('beat_nowhere')
    // A draft open that isn't there: one that is, is.
    expect(ops.normalizeStory({ ...saved, draft: 'draft_gone' }).draft).toBe(saved.draft)
  })

  it('names new drafts in order, and renames and moves them', () => {
    expect(nextDraftName([{ name: 'First draft' }])).toBe('Second draft')
    expect(nextDraftName([{ name: 'First draft' }, { name: 'Third draft' }])).toBe('Fourth draft')
    const [data, id] = newDraft(ops.emptyStory(), { copy: true })
    expect(renameDraft(data, id, '  Rewrite  ').drafts[1].name).toBe('Rewrite')
    expect(renameDraft(data, id, '   ')).toBe(data)
    expect(moveDraft(data, 1, 0).drafts.map((d) => d.id)).toEqual([id, DEFAULT_DRAFT_ID])
  })

  it('deletes a draft that isn’t open, with what was archived from it', () => {
    const sample = buildSampleStory()
    const archived = archiveItem(sample, 'chapter', sample.chapters[0].id, AT)
    const [data, id] = newDraft(archived, { copy: true })
    expect(deleteDraft(data, id)).toBe(data)
    const gone = deleteDraft(data, DEFAULT_DRAFT_ID)
    expect(gone.drafts.map((d) => d.id)).toEqual([id])
    expect(gone.archive).toEqual([])
  })
})

describe('the mind maps, in every draft', () => {
  it('keep cards for chapters, arcs and beats in another draft', () => {
    let data = buildSampleStory()
    const chapter = data.chapters[1].id
    ;[data] = ops.addMapNode(data, { kind: 'chapter', refId: chapter, x: 0, y: 0 })
    const [blank] = newDraft(data, { copy: false })
    expect(idsElsewhere(blank).has(chapter)).toBe(true)
    expect(draftHaving(blank, chapter)?.name).toBe('First draft')
    // Through a save: the card's chapter is in the first draft.
    const saved = ops.normalizeStory(JSON.parse(JSON.stringify(blank)))
    expect(saved.mindMaps.some((m) => m.nodes.some((n) => 'refId' in n && n.refId === chapter))).toBe(true)
    // Deleting the chapter in a copy keeps the card (it's still in the first draft)…
    const [copy] = newDraft(data, { copy: true })
    const deleted = ops.deleteChapter(copy, chapter)
    expect(deleted.mindMaps.some((m) => m.nodes.some((n) => 'refId' in n && n.refId === chapter))).toBe(true)
    // …but not when it's in no draft.
    expect(ops.deleteChapter(data, chapter).mindMaps.some((m) => m.nodes.some((n) => 'refId' in n && n.refId === chapter))).toBe(false)
  })

  it('unmention a character deleted in every draft', () => {
    let data = buildSampleStory()
    const mara = data.characters[0]
    const chapter = data.chapters[0].id
    data = ops.setChapterText(data, chapter, { doc: doc('Hello ', [{ type: 'mention', attrs: { id: mara.id } }]), words: 2, updatedAt: AT }, null)
    data = ops.updateChapter(data, chapter, { summary: `With ${mentionToken(mara.id)}` })
    const [copy] = newDraft(data, { copy: true })
    const gone = ops.deleteCharacter(copy, mara.id)
    const first = gone.drafts[0].book!
    expect(first.chapters[0].summary).toBe(`With ${mara.name}`)
    expect(JSON.stringify(first.texts[chapter].doc)).not.toContain(mara.id)
  })
})

describe('archiving, by draft', () => {
  it('brings a chapter back in the draft it was archived from, and leaves the other draft’s alone', () => {
    const sample = buildSampleStory()
    const chapter = sample.chapters[1].id
    const [both] = newDraft(sample, { copy: true })
    // Archived in the copy: the same chapter is still in the first draft.
    const archived = archiveItem(both, 'chapter', chapter, AT)
    expect(archived.archive[0].draft).toBe(both.draft)
    const first = switchDraft(archived, DEFAULT_DRAFT_ID)
    expect(archiveHere(first)).toEqual([])
    expect(restoreArchived(first, chapter)).toBe(first)
    // Archived in the first draft too: two of it, one each.
    const twice = archiveItem(first, 'chapter', chapter, AT + 1)
    expect(twice.archive.map((a) => a.draft)).toEqual([both.draft, DEFAULT_DRAFT_ID])
    expect(ops.normalizeStory(JSON.parse(JSON.stringify(twice))).archive).toHaveLength(2)
    // A change through the archive here leaves the copy's as it was.
    const changed = throughArchive(twice, (d) => ops.deleteElement(d, d.elements[0].id))
    expect(changed.archive[0]).toBe(twice.archive[0])
    // Back in the copy, it comes back there.
    const copy = switchDraft(twice, both.draft)
    const restored = restoreArchived(copy, chapter)
    expect(restored.chapters.map((c) => c.id)).toEqual(sample.chapters.map((c) => c.id))
    expect(restored.archive.map((a) => a.draft)).toEqual([DEFAULT_DRAFT_ID])
  })

  it('archives chapters shelved before drafts, and tags what was archived before them', () => {
    const sample = buildSampleStory()
    const saved = JSON.parse(JSON.stringify(sample))
    saved.chapters[1].status = 'shelved'
    saved.chapters[0].status = 'draft'
    delete saved.drafts
    delete saved.draft
    const upgraded = upgradeStory(saved, AT)
    expect(upgraded.chapters.map((c) => c.id)).toEqual([sample.chapters[0].id, sample.chapters[2].id, sample.chapters[3].id])
    expect(upgraded.archive).toHaveLength(1)
    expect(upgraded.archive[0]).toMatchObject({ kind: 'chapter', id: sample.chapters[1].id, draft: DEFAULT_DRAFT_ID, at: AT })
    // (Archived before drafts: from the one draft.)
    const old = JSON.parse(JSON.stringify(archiveItem(sample, 'beat', Object.keys(sample.beats)[0], AT)))
    delete old.archive[0].draft
    expect(ops.normalizeStory(old).archive[0].draft).toBe(DEFAULT_DRAFT_ID)
  })
})
