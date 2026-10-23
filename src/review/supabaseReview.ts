import { createClient } from '@supabase/supabase-js'
import { CloudError, type CommentRow } from '../cloud/backend'
import { LinkGone, type ReviewBackend, type ReviewStory } from './backend'

// A review on Supabase: the review_* functions (see supabase/migrations),
// each given the link's token; and the pictures, which Storage lets through
// for the story the token in the x-review-token header opens. No account is
// signed in to, and nothing is kept in this browser.

export function supabaseReview(url: string, key: string, token: string): ReviewBackend {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'story-builder-review' },
    global: { headers: { 'x-review-token': token } },
  })

  async function call<T>(name: string, args: Record<string, unknown>, fallback: string): Promise<T> {
    const { data, error } = await client.rpc(name, { p_token: token, ...args })
    // The functions turn down a token they don't know with "invalid authorization" (28000).
    if (error?.code === '28000' || (error && /review link/i.test(error.message))) throw new LinkGone()
    if (error) {
      if (/fetch|network|timed? ?out|load failed/i.test(error.message)) throw new CloudError('Can’t reach the story just now. Check the connection.', true)
      throw new CloudError(error.message || fallback)
    }
    return data as T
  }

  return {
    async open() {
      const found = await call<Record<string, unknown> | null>('review_open', {}, 'Couldn’t open the story.')
      if (!found) throw new LinkGone()
      return {
        id: String(found.id),
        owner: String(found.owner),
        title: String(found.title ?? ''),
        label: String(found.label ?? ''),
        updatedAt: String(found.updated_at ?? ''),
        data: found.data,
      } satisfies ReviewStory
    },
    listComments: async (me) => (await call<CommentRow[] | null>('review_comments', { p_me: me }, 'Couldn’t load the comments.')) ?? [],
    addComment: (me, name, thread, target, body) =>
      call<string>('review_add_comment', { p_me: me, p_name: name, p_thread: thread, p_target: target, p_body: body }, 'Couldn’t post the comment.'),
    resolveComment: (name, id, resolved) =>
      call<void>('review_resolve_comment', { p_name: name, p_comment: id, p_resolved: resolved }, resolved ? 'Couldn’t resolve it.' : 'Couldn’t reopen it.'),
    editComment: (me, id, body) => call<void>('review_edit_comment', { p_me: me, p_comment: id, p_body: body }, 'Couldn’t change the comment.'),
    removeComment: (me, id) => call<void>('review_remove_comment', { p_me: me, p_comment: id }, 'Couldn’t delete the comment.'),
    async downloadPicture(owner, id) {
      const { data, error } = await client.storage.from('pictures').download(`${owner}/${id}`)
      return error ? null : data
    },
  }
}
