import { buildSampleStory } from '../src/store/sampleStory'

// Where the stories an assistant reads come from: a writer's account, opened
// by the private key in their link, or the example story (the link
// …/mcp/example), for trying it out.

export interface StoryRow {
  id: string
  title: string
  /** When it was last saved (ISO date). */
  updatedAt: string
}

export interface StorySource {
  /** The stories, most recently saved first. Throws InvalidKey when the key doesn't open an account. */
  list(): Promise<StoryRow[]>
  /** A story's contents as saved, or null if it isn't there (any more). */
  load(id: string): Promise<unknown>
}

/** The key isn't one the account store knows: never made, revoked, or cut short when copied. */
export class InvalidKey extends Error {
  constructor() {
    super('That key doesn’t open an account.')
    this.name = 'InvalidKey'
  }
}

export const EXAMPLE_KEY = 'example'

/** What Story Builder makes: 32 random bytes, as base64url. */
export const looksLikeKey = (key: string) => /^[A-Za-z0-9_-]{43}$/.test(key)

let example: ReturnType<typeof buildSampleStory> | null = null

/** The example story, The Lighthouse at Gull Point. */
export function exampleSource(): StorySource {
  example ??= buildSampleStory()
  const data = example
  return {
    list: async () => [{ id: EXAMPLE_KEY, title: data.title, updatedAt: new Date(0).toISOString() }],
    load: async (id) => (id === EXAMPLE_KEY ? data : null),
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
    if (!response.ok) throw new Error(`The account store answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
    return (await response.json()) as T
  }
  let listed: Promise<StoryRow[]> | null = null
  return {
    list: () =>
      (listed ??= call<{ id: string; title: string; updated_at: string }[]>('assistant_stories', { p_key: key }).then((rows) =>
        rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at })),
      )),
    load: (id) => call<unknown>('assistant_story', { p_key: key, p_story: id }),
  }
}
