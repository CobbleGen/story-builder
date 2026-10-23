import { describe, expect, it } from 'vitest'
import { addComment, connectComments, refreshComments, useComments, type CommentsBackend } from './store'

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  thread: null,
  author_kind: 'editor',
  author_name: 'Anna',
  target: { kind: 'story' },
  body: 'Hello',
  created_at: '2026-10-23T10:00:00Z',
  mine: false,
  ...over,
})

describe('the comments store', () => {
  it('fetches comments in threads, and again after each change', async () => {
    const rows = [row('a')]
    const backend: CommentsBackend = {
      viewer: 'editor',
      list: async () => rows.map((r) => ({ ...r })),
      add: async (thread, target, body) => {
        rows.push(row(`c${rows.length}`, { thread, target, body }))
        return `c${rows.length - 1}`
      },
      resolve: async () => {},
      edit: async () => {},
      remove: async () => {},
    }
    connectComments(backend, 'story-1')
    await refreshComments()
    expect(useComments.getState().threads.map((t) => t.id)).toEqual(['a'])
    expect(await addComment({ kind: 'story' }, '  Another  ')).toBe('c1')
    expect(useComments.getState().threads.map((t) => [t.id, t.first.body])).toEqual([
      ['a', 'Hello'],
      ['c1', 'Another'],
    ])
    connectComments(null, null)
    expect(useComments.getState().threads).toEqual([])
  })

  it('never throws for a backend that fails, even at once: the error is kept to show', async () => {
    const broken = {
      viewer: 'writer',
      list: () => {
        throw new TypeError('backend.listComments is not a function')
      },
    } as unknown as CommentsBackend
    expect(() => connectComments(broken, 'story-2')).not.toThrow()
    await refreshComments()
    expect(useComments.getState().error).toMatch(/not a function/)
    // Commenting with no backend at all says what to do, as a rejected promise.
    connectComments(null, null)
    await expect(addComment({ kind: 'story' }, 'x')).rejects.toThrow(/sign in/)
  })
})
