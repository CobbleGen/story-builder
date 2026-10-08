import { afterEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { buildSampleStory } from '../src/store/sampleStory'
import { handleRequest, keyOf } from './mcp'
import { accountSource, InvalidKey, type AccountStore } from './sources'

// The server as an assistant meets it: an MCP client connecting over HTTP,
// with requests answered by handleRequest (no network).

const ORIGIN = 'https://story-builder.example'
const KEY = 'k'.repeat(43)
const STORE: AccountStore = { url: 'https://store.example', apiKey: 'public-key' }

/** A stand-in account store: the two read-only functions, for one key. */
function fakeStore(stories: { id: string; title: string; updated_at: string; data: unknown }[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const args = JSON.parse(String(init?.body ?? '{}'))
    if (args.p_key !== KEY) return Response.json({ code: '28000', message: 'invalid key' }, { status: 403 })
    if (url.endsWith('/rpc/assistant_stories')) return Response.json(stories.map(({ id, title, updated_at }) => ({ id, title, updated_at })))
    if (url.endsWith('/rpc/assistant_story')) return Response.json(stories.find((s) => s.id === args.p_story)?.data ?? null)
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

const clients: Client[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()))
})

async function connect(key: string, store: AccountStore | null = null) {
  const client = new Client({ name: 'test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp/${key}`), {
    fetch: (url, init) => handleRequest(new Request(url, init), store, () => '2026-10-08'),
  })
  await client.connect(transport)
  clients.push(client)
  return client
}

const text = (result: Awaited<ReturnType<Client['callTool']>>) => (result.content as { type: string; text: string }[]).map((c) => c.text).join('\n')

describe('the story server', () => {
  it('introduces itself, and lists read-only tools and prompts', async () => {
    const client = await connect('example')
    expect(client.getServerVersion()?.name).toBe('story-builder')
    expect(client.getInstructions()).toMatch(/Story Builder is a writing app/)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual([
      'list_stories',
      'get_story_overview',
      'read_chapter',
      'read_manuscript',
      'get_outline',
      'get_timeline',
      'get_characters',
      'get_places_and_things',
      'get_mind_maps',
      'search_story',
      'get_writing_progress',
    ])
    expect(tools.every((t) => t.annotations?.readOnlyHint && !t.annotations?.destructiveHint)).toBe(true)
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name)).toEqual(['review_chapter', 'review_story', 'check_continuity', 'whats_next'])
    const prompt = await client.getPrompt({ name: 'review_chapter', arguments: { chapter: '3' } })
    expect((prompt.messages[0].content as { text: string }).text).toMatch(/chapter 3 of my story/)
  })

  it('reads the example story', async () => {
    const client = await connect('example')
    expect(text(await client.callTool({ name: 'get_story_overview', arguments: {} }))).toMatch(/^# The Lighthouse at Gull Point/)
    const chapter = text(await client.callTool({ name: 'read_chapter', arguments: { chapter: 'the logbook' } }))
    expect(chapter).toMatch(/^# Chapter 3: The Logbook/)
    expect(chapter).toMatch(/In the text: “The bottom drawer stuck/)
    expect(chapter).toMatch(/The keeper’s cottage had not changed/)
    expect(text(await client.callTool({ name: 'get_timeline', arguments: {} }))).toMatch(/## Before the book begins \(backstory\)\n1\. \[Twenty years earlier\] Elias’s first run/)
    expect(text(await client.callTool({ name: 'get_characters', arguments: { name: 'elias' } }))).toMatch(/Secret: Guides smugglers past the reef/)
    expect(text(await client.callTool({ name: 'get_mind_maps', arguments: {} }))).toMatch(/Elias \(character\) — Mara \(character\): “father of”/)
    expect(text(await client.callTool({ name: 'search_story', arguments: { query: 'oilcloth' } }))).toMatch(/Chapter 3: The Logbook, paragraph 3/)
    expect(text(await client.callTool({ name: 'get_writing_progress', arguments: {} }))).toMatch(/Manuscript: 274 words/)
  })

  it('says what there is when something asked for isn’t there', async () => {
    const client = await connect('example')
    const result = await client.callTool({ name: 'read_chapter', arguments: { chapter: '9' } })
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(/No chapter “9”\. The chapters are: 1\. The Storm, 2\. Wreckage, 3\. The Logbook, 4\. Low Tide\./)
    expect(text(await client.callTool({ name: 'get_characters', arguments: { name: 'nobody' } }))).toMatch(/There are: Mara, Theo, Elias, Harrow/)
  })

  it('reads an account’s stories by its key, the latest by default', async () => {
    const older = { ...buildSampleStory(), title: 'An older story' }
    const store = fakeStore([
      { id: 's2', title: 'The Lighthouse at Gull Point', updated_at: '2026-10-08T10:00:00Z', data: buildSampleStory() },
      { id: 's1', title: 'An older story', updated_at: '2026-09-01T10:00:00Z', data: older },
    ])
    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp/${KEY}`), {
        fetch: async (url, init) => {
          const request = new Request(url, init)
          // The server reaches the store with the fake fetch.
          const original = globalThis.fetch
          globalThis.fetch = store
          try {
            return await handleRequest(request, STORE)
          } finally {
            globalThis.fetch = original
          }
        },
      }),
    )
    clients.push(client)
    expect(text(await client.callTool({ name: 'list_stories', arguments: {} }))).toMatch(/1\. The Lighthouse at Gull Point, last saved 2026-10-08 10:00 UTC \(read by default\)\n2\. An older story/)
    expect(text(await client.callTool({ name: 'get_story_overview', arguments: {} }))).toMatch(/^\(From “The Lighthouse at Gull Point”, the most recently edited of 2 stories/)
    expect(text(await client.callTool({ name: 'get_story_overview', arguments: { story: 'older' } }))).toMatch(/^# An older story/)
  })

  it('turns away links that don’t work', async () => {
    const post = (path: string) =>
      handleRequest(
        new Request(`${ORIGIN}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        }),
        STORE,
      )
    for (const path of ['/mcp/short', '/mcp']) {
      const response = await post(path)
      expect(response.status).toBe(403)
      expect((await response.json()).error.message).toMatch(/link doesn’t work/)
    }
    // A key of the right shape that the store doesn't know
    const original = globalThis.fetch
    globalThis.fetch = fakeStore([])
    try {
      const response = await post(`/mcp/${'x'.repeat(43)}`)
      expect(response.status).toBe(403)
    } finally {
      globalThis.fetch = original
    }
  })

  it('answers browsers with a page, and has no event stream or sessions', async () => {
    const page = await handleRequest(new Request(`${ORIGIN}/mcp/example`, { headers: { accept: 'text/html' } }), STORE)
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toMatch(/reads the example story/)
    expect(html).toMatch(/Story overview · Read a chapter · Read the manuscript · Outline · Story time · Characters · Places, objects and groups · Mind maps · Search the story · Writing progress/)
    expect(html).toMatch(/claude mcp add --transport http story-builder https:\/\/story-builder\.example\/mcp\/example/)
    expect((await handleRequest(new Request(`${ORIGIN}/mcp/nope`, { headers: { accept: 'text/html' } }), STORE)).status).toBe(403)
    // Behind Vercel's proxy the function is reached over http; the page gives the https address visitors use.
    const proxied = await handleRequest(
      new Request('http://internal.example/mcp?key=example', { headers: { accept: 'text/html', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'story-builder-flame.vercel.app' } }),
      STORE,
    )
    expect(await proxied.text()).toMatch(/story-builder https:\/\/story-builder-flame\.vercel\.app\/mcp\/example</)
    expect((await handleRequest(new Request(`${ORIGIN}/mcp/example`, { headers: { accept: 'text/event-stream' } }), STORE)).status).toBe(405)
    expect((await handleRequest(new Request(`${ORIGIN}/mcp/example`, { method: 'DELETE' }), STORE)).status).toBe(405)
    const preflight = await handleRequest(new Request(`${ORIGIN}/mcp/example`, { method: 'OPTIONS' }), STORE)
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('finds the key in the path, the query (as Vercel passes it on) or a bearer header', () => {
    expect(keyOf(new Request(`${ORIGIN}/mcp/${KEY}`))).toBe(KEY)
    expect(keyOf(new Request(`${ORIGIN}/mcp?key=${KEY}`))).toBe(KEY)
    expect(keyOf(new Request(`${ORIGIN}/mcp`, { headers: { authorization: `Bearer ${KEY}` } }))).toBe(KEY)
    expect(keyOf(new Request(`${ORIGIN}/mcp`))).toBeNull()
  })
})

describe('an account’s stories', () => {
  it('asks the store with the key, and knows a refused key', async () => {
    const calls: string[] = []
    const store = fakeStore([{ id: 's1', title: 'One', updated_at: '2026-10-08T10:00:00Z', data: { title: 'One' } }])
    const spy = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${String(input)} ${new Headers(init?.headers).get('apikey')}`)
      return store(input, init)
    }) as typeof fetch
    const source = accountSource(KEY, STORE, spy)
    expect(await source.list()).toEqual([{ id: 's1', title: 'One', updatedAt: '2026-10-08T10:00:00Z' }])
    expect(await source.load('s1')).toEqual({ title: 'One' })
    expect(await source.load('gone')).toBeNull()
    expect(calls[0]).toBe('https://store.example/rest/v1/rpc/assistant_stories public-key')
    await expect(accountSource('y'.repeat(43), STORE, store).list()).rejects.toBeInstanceOf(InvalidKey)
  })
})
