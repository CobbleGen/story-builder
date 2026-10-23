import { randomUUID } from 'node:crypto'
import { buildSampleStory } from '../src/store/sampleStory'

// Where the stories an assistant reads come from: a writer's account, opened
// by the private key in their link, or the example story (the link
// …/mcp/example), for trying it out. The assistant can also comment on them,
// as an editor would (the comments are kept apart from the stories, which it
// can't change).

export interface StoryRow {
  id: string
  title: string
  /** When it was last saved (ISO date). */
  updatedAt: string
}

/** A comment as the account keeps it (see src/comments/model's commentOf). */
export type CommentRow = Record<string, unknown>

export interface StorySource {
  /** The stories, most recently saved first. Throws InvalidKey when the key doesn't open an account. */
  list(): Promise<StoryRow[]>
  /** A story's contents as saved, or null if it isn't there (any more). */
  load(id: string): Promise<unknown>
  /** A story's comments, oldest first; `mine` on those this assistant made. */
  comments(id: string): Promise<CommentRow[]>
  /** Adds a comment (a reply, with `thread`; else on `target`): its id. */
  addComment(id: string, thread: string | null, target: unknown, body: string): Promise<string>
  /** Resolves a comment's thread, or opens it again. */
  resolveComment(id: string, comment: string, resolved: boolean): Promise<void>
}

/** The account store turned down a comment (too long, nothing to reply to…): its words say why. */
export class CommentRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommentRefused'
  }
}

/** The key isn't one the account store knows: never made, revoked, or cut short when copied. */
export class InvalidKey extends Error {
  constructor() {
    super('That key doesn’t open an account.')
    this.name = 'InvalidKey'
  }
}

export const EXAMPLE_KEY = 'example'

/** What Arc Creator makes: 32 random bytes, as base64url. */
export const looksLikeKey = (key: string) => /^[A-Za-z0-9_-]{43}$/.test(key)

let example: ReturnType<typeof buildSampleStory> | null = null

/** Comments on the example story: kept only for a while, in this server's memory (and only so many). */
const exampleComments: CommentRow[] = []

/** The example story, The Lighthouse at Gull Point. */
export function exampleSource(): StorySource {
  example ??= buildSampleStory()
  const data = example
  const find = (id: string) => exampleComments.find((c) => c.id === id)
  return {
    list: async () => [{ id: EXAMPLE_KEY, title: data.title, updatedAt: new Date(0).toISOString() }],
    load: async (id) => (id === EXAMPLE_KEY ? data : null),
    comments: async () => exampleComments.map((c) => ({ ...c })),
    async addComment(_id, thread, target, body) {
      if (thread && !find(thread)) throw new CommentRefused('There’s no such comment to reply to.')
      const row = {
        id: randomUUID(),
        thread,
        author_kind: 'assistant',
        author_name: 'AI assistant',
        target: thread ? null : target,
        body,
        created_at: new Date().toISOString(),
        edited_at: null,
        resolved_at: null,
        resolved_by: null,
        mine: true,
      }
      exampleComments.push(row)
      if (exampleComments.length > 200) exampleComments.splice(0, exampleComments.length - 200)
      return row.id
    },
    async resolveComment(_id, comment, resolved) {
      const c = find(comment)
      if (!c) throw new CommentRefused('There’s no such comment.')
      const first = c.thread ? find(String(c.thread)) : c
      if (first) Object.assign(first, resolved ? { resolved_at: new Date().toISOString(), resolved_by: 'AI assistant' } : { resolved_at: null, resolved_by: null })
    },
  }
}

export interface AccountStore {
  /** The account store's address (https://<project>.supabase.co). */
  url: string
  /** Its public (publishable) key. */
  apiKey: string
}

/**
 * The stories in the account a key belongs to, through two read-only
 * functions in the database (see supabase/migrations): the key is checked
 * there, and nothing else about the account is reachable with it.
 */
export function accountSource(key: string, store: AccountStore, fetcher: typeof fetch = fetch): StorySource {
  async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const response = await fetcher(`${store.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: store.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(args),
    })
    // The functions refuse an unknown key with "invalid authorization" (SQLSTATE 28000), which comes back as 403.
    if (response.status === 401 || response.status === 403) throw new InvalidKey()
    // A comment turned down (bad input, nothing to reply to) comes back as 400 or 404, with its reason.
    if (response.status === 400 || response.status === 404) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      if (body?.message) throw new CommentRefused(body.message)
    }
    if (!response.ok) throw new Error(`The account store answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
    // (A function with nothing to return answers with nothing.)
    const body = await response.text()
    return (body ? JSON.parse(body) : null) as T
  }
  let listed: Promise<StoryRow[]> | null = null
  return {
    list: () =>
      (listed ??= call<{ id: string; title: string; updated_at: string }[]>('assistant_stories', { p_key: key }).then((rows) =>
        rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at })),
      )),
    load: (id) => call<unknown>('assistant_story', { p_key: key, p_story: id }),
    comments: (id) => call<CommentRow[]>('assistant_comments', { p_key: key, p_story: id }),
    addComment: (id, thread, target, body) =>
      call<string>('assistant_add_comment', { p_key: key, p_story: id, p_thread: thread, p_target: target, p_body: body }),
    resolveComment: (id, comment, resolved) =>
      call<void>('assistant_resolve_comment', { p_key: key, p_story: id, p_comment: comment, p_resolved: resolved }),
  }
}
