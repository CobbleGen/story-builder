import { describe, expect, it } from 'vitest'
import { buildSampleStory } from '../store/sampleStory'
import { lookupOf } from '../lib/mentions'
import { DEFAULT_DRAFT_ID } from '../lib/drafts'
import { authorName, commentOf, countComments, describeTarget, targetOf, threadsOf, type StoryComment } from './model'

const row = (over: Record<string, unknown>) => ({
  id: 'c1',
  thread: null,
  author_kind: 'editor',
  author_name: 'Anna',
  target: { kind: 'story' },
  body: 'Hello',
  created_at: '2026-10-23T10:00:00Z',
  edited_at: null,
  resolved_at: null,
  resolved_by: null,
  mine: false,
  ...over,
})
const all = (rows: Record<string, unknown>[]) => rows.map(commentOf).filter((c): c is StoryComment => !!c)

describe('comments', () => {
  it('reads targets and rows as saved, leaving out what makes no sense', () => {
    expect(targetOf({ kind: 'text', id: 'ch1', quote: 'The lamp', prefix: 'a', suffix: 'b', junk: 1 })).toEqual({ kind: 'text', id: 'ch1', quote: 'The lamp', prefix: 'a', suffix: 'b' })
    expect(targetOf({ kind: 'text', id: 'ch1' })).toBeNull()
    expect(targetOf({ kind: 'beat' })).toBeNull()
    expect(targetOf({ kind: 'nonsense', id: 'x' })).toBeNull()
    expect(targetOf({ kind: 'map', id: 'm1', node: 'n1', label: 'Plot' })).toEqual({ kind: 'map', id: 'm1', node: 'n1', label: 'Plot' })
    expect(commentOf(row({ author_kind: 'robot' }))).toBeNull()
    // A reply has no target.
    expect(commentOf(row({ id: 'c2', thread: 'c1', target: null }))?.thread).toBe('c1')
  })

  it('puts replies with their thread, oldest first', () => {
    const threads = threadsOf(
      all([
        row({ id: 'b', created_at: '2026-10-23T11:00:00Z', target: { kind: 'beat', id: 'beat1' } }),
        row({ id: 'a', resolved_at: '2026-10-23T12:00:00Z' }),
        row({ id: 'r1', thread: 'b', target: null, created_at: '2026-10-23T11:30:00Z' }),
        row({ id: 'r2', thread: 'gone', target: null }),
      ]),
    )
    expect(threads.map((t) => [t.id, t.replies.map((r) => r.id), t.resolved])).toEqual([
      ['a', [], true],
      ['b', ['r1'], false],
    ])
  })

  it('counts open comments by where they’re seen, in the open draft', () => {
    const threads = threadsOf(
      all([
        row({ id: '1', target: { kind: 'text', id: 'ch3', quote: 'x' } }),
        row({ id: '2', target: { kind: 'text', id: 'ch3', quote: 'y', draft: DEFAULT_DRAFT_ID } }),
        row({ id: '3', target: { kind: 'chapter', id: 'ch4' } }),
        row({ id: '4', target: { kind: 'beat', id: 'b1' } }),
        row({ id: '5', target: { kind: 'map', id: 'm1', node: 'n1' } }),
        row({ id: '6', target: { kind: 'character', id: 'mara' } }),
        row({ id: '7', target: { kind: 'text', id: 'ch3', quote: 'z' }, resolved_at: '2026-10-23T12:00:00Z' }),
        row({ id: '8', target: { kind: 'chapter', id: 'ch3', draft: 'draft_other' } }),
        row({ id: '9', target: { kind: 'story' } }),
      ]),
    )
    const counts = countComments(threads, DEFAULT_DRAFT_ID)
    expect(counts.total).toBe(7)
    expect(counts.places).toMatchObject({ manuscript: 3, board: 2, timeline: 1, map: 1, characters: 1, story: 1 })
    expect(counts.chapters.get('ch3')).toBe(2)
    expect(counts.chapters.get('ch4')).toBe(1)
    expect(counts.cards.get('n1')).toBe(1)
    // In the other draft, its chapter comment and what every draft shares.
    const other = countComments(threads, 'draft_other')
    expect(other.total).toBe(4)
    expect(other.chapters.get('ch3')).toBe(1)
  })

  it('says what a comment is on, and when it’s gone', () => {
    const data = buildSampleStory()
    const lookup = lookupOf([...data.characters, ...data.elements])
    const chapter = data.chapters[2]
    expect(describeTarget({ kind: 'text', id: chapter.id, quote: 'x' }, data, lookup).label).toMatch(/^Chapter 3: /)
    const beat = Object.values(data.beats)[0]
    expect(describeTarget({ kind: 'beat', id: beat.id }, data, lookup).label).toContain('Beat “')
    expect(describeTarget({ kind: 'beat', id: 'gone', label: 'Beat “Old”' }, data, lookup)).toEqual({ label: 'Beat “Old”', gone: true })
    const map = data.mindMaps[0]
    const note = map.nodes.find((n) => n.kind === 'note')
    if (note) expect(describeTarget({ kind: 'map', id: map.id, node: note.id }, data, lookup).label).toMatch(/^Mind map “.*” · Sticky note “/)
    expect(describeTarget({ kind: 'character', id: data.characters[0].id }, data, lookup).label).toBe(data.characters[0].name)
  })

  it('names who wrote a comment', () => {
    const c = commentOf(row({}))!
    expect(authorName(c, 'writer')).toBe('Anna')
    expect(authorName({ ...c, mine: true }, 'editor')).toBe('You')
    expect(authorName({ ...c, author: { kind: 'writer', name: '' } }, 'editor')).toBe('The writer')
    expect(authorName({ ...c, author: { kind: 'writer', name: '' } }, 'writer')).toBe('You')
    expect(authorName({ ...c, author: { kind: 'assistant', name: 'Claude' } }, 'writer')).toBe('Claude')
  })
})
