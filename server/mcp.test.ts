import { afterEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { buildSampleStory } from '../src/store/sampleStory'
import { newDraft } from '../src/store/drafts'
import * as ops from '../src/store/storyOps'
import { handleRequest, keyOf } from './mcp'
import { accountSource, InvalidKey, type AccountStore } from './sources'

// The server as an assistant meets it: an MCP client connecting over HTTP,
// with requests answered by handleRequest (no network).

const ORIGIN = 'https://story-builder.example'
const KEY = 'k'.repeat(43)
const STORE: AccountStore = { url: 'https://store.example', apiKey: 'public-key' }

/** A stand-in account store: the functions an assistant's key opens, for one key, with comments kept in `comments`. */
function fakeStore(stories: { id: string; title: string; updated_at: string; data: unknown }[], comments: Record<string, unknown>[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const args = JSON.parse(String(init?.body ?? '{}'))
    if (args.p_key !== KEY) return Response.json({ code: '28000', message: 'invalid key' }, { status: 403 })
    if (url.endsWith('/rpc/assistant_stories')) return Response.json(stories.map(({ id, title, updated_at }) => ({ id, title, updated_at })))
    if (url.endsWith('/rpc/assistant_story')) return Response.json(stories.find((s) => s.id === args.p_story)?.data ?? null)
    if (url.endsWith('/rpc/assistant_comments')) return Response.json(comments.filter((c) => c.story === args.p_story))
    if (url.endsWith('/rpc/assistant_add_comment')) {
      if (args.p_thread && !comments.some((c) => c.id === args.p_thread)) return Response.json({ code: 'P0002', message: 'There’s no such comment to reply to.' }, { status: 404 })
      const id = `c${comments.length + 1}`
      comments.push({ id, story: args.p_story, thread: args.p_thread, target: args.p_target, body: args.p_body, author_kind: 'assistant', author_name: 'Claude', created_at: '2026-10-23T10:00:00Z', mine: true })
      return Response.json(id)
    }
    if (url.endsWith('/rpc/assistant_resolve_comment')) {
      const c = comments.find((x) => x.id === args.p_comment)
      if (c) c.resolved_at = args.p_resolved ? '2026-10-23T11:00:00Z' : null
      return new Response(null, { status: 204 })
    }
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
      'get_comments',
      'add_comment',
      'suggest_change',
      'reply_to_comment',
      'resolve_comment',
    ])
    // Everything reads, and nothing destroys; only commenting writes (comments and suggestions, never the story).
    const writes = tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name)
    expect(writes).toEqual(['add_comment', 'suggest_change', 'reply_to_comment', 'resolve_comment'])
    expect(tools.some((t) => t.annotations?.destructiveHint)).toBe(false)
    expect(client.getInstructions()).toMatch(/can comment on them and suggest changes, as an editor would/)
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name)).toEqual(['review_chapter', 'review_story', 'check_continuity', 'whats_next', 'edit_with_comments', 'answer_comments'])
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
    expect(html).toMatch(
      /Story overview · Read a chapter · Read the manuscript · Outline · Story time · Characters · Places, objects and groups · Mind maps · Search the story · Writing progress · Comments · Add a comment · Suggest a change · Reply to a comment · Resolve a comment/,
    )
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

describe('comments', () => {
  it('comments on a passage, a beat and a card of the example story; replies and resolves', async () => {
    const client = await connect('example')
    const passage = text(
      await client.callTool({ name: 'add_comment', arguments: { chapter: '3', quote: 'The same kettle with the dent', comment: 'Lovely detail.' } }),
    )
    expect(passage).toMatch(/^Comment (\S+) added, on Chapter 3: The Logbook\. The writer sees it/)
    const id = /^Comment (\S+) added/.exec(passage)![1]
    expect(text(await client.callTool({ name: 'add_comment', arguments: { beat: 'the lamp goes dark', comment: 'Why now?' } }))).toMatch(/on Beat “The lamp goes dark”/)
    expect(text(await client.callTool({ name: 'add_comment', arguments: { mind_map: 'who knows', card: 'smuggling', comment: 'Answer this by chapter 4.' } }))).toMatch(
      /on Mind map “Who knows what” · Sticky note “What if Theo already knows about the smuggling\?”/,
    )
    let all = text(await client.callTool({ name: 'get_comments', arguments: {} }))
    expect(all).toMatch(/## Chapter 3: The Logbook\n- Comment \S+, on Chapter 3: The Logbook\n  On the words: “The same kettle with the dent”\n  you \(AI assistant\), [\d-]+ [\d:]+: Lovely detail\./)
    expect(all).toMatch(/## Beats\n- Comment \S+, on Beat “The lamp goes dark”/)
    expect(text(await client.callTool({ name: 'get_comments', arguments: { chapter: 'the logbook' } }))).not.toMatch(/## Beats/)
    // Replies, then resolves (by the first few characters of its id, too)
    expect(text(await client.callTool({ name: 'reply_to_comment', arguments: { comment_id: id, reply: 'And the barometer.' } }))).toMatch(new RegExp(`added to comment ${id}`))
    expect(text(await client.callTool({ name: 'resolve_comment', arguments: { comment_id: id.slice(0, 8) } }))).toBe(`Comment ${id} resolved.`)
    all = text(await client.callTool({ name: 'get_comments', arguments: {} }))
    expect(all).not.toMatch(/Lovely detail/)
    all = text(await client.callTool({ name: 'get_comments', arguments: { resolved: true } }))
    expect(all).toMatch(/Comment \S+ \(resolved\), on Chapter 3[\s\S]*↳ you \(AI assistant\), [\d-]+ [\d:]+: And the barometer\./)
    expect(text(await client.callTool({ name: 'get_story_overview', arguments: {} }))).toMatch(/## Comments\n\d+ open, \d+ resolved/)
  })

  it('says what’s wrong with a comment it can’t place', async () => {
    const client = await connect('example')
    const missing = await client.callTool({ name: 'add_comment', arguments: { chapter: '3', quote: 'words that are nowhere', comment: 'x' } })
    expect(missing.isError).toBe(true)
    expect(text(missing)).toMatch(/Those words aren’t in Chapter 3: The Logbook\. Quote them exactly/)
    expect(text(await client.callTool({ name: 'add_comment', arguments: { beat: 'x', arc: 'y', comment: 'x' } }))).toMatch(/one thing at a time/)
    expect(text(await client.callTool({ name: 'add_comment', arguments: { quote: 'The same kettle', comment: 'x' } }))).toMatch(/needs the chapter/)
    expect(text(await client.callTool({ name: 'reply_to_comment', arguments: { comment_id: 'nope', reply: 'x' } }))).toMatch(/No comment nope/)
  })

  it('suggests changes: new words for a passage, a beat’s title, a sticky note’s words', async () => {
    const client = await connect('example')
    const passage = text(
      await client.callTool({
        name: 'suggest_change',
        arguments: { chapter: '3', quote: 'The same kettle with the dent', new_text: 'The dented kettle', comment: 'Fewer words.' },
      }),
    )
    expect(passage).toMatch(/^Suggestion \S+ added, on Chapter 3: The Logbook: new words for the passage\. The writer sees it in Story Builder and can accept or decline it\./)
    expect(text(await client.callTool({ name: 'suggest_change', arguments: { beat: 'the lamp goes dark', field: 'title', new_text: 'The lamp fails' } }))).toMatch(
      /on Beat “The lamp goes dark”: a new title\./,
    )
    expect(text(await client.callTool({ name: 'suggest_change', arguments: { mind_map: 'who knows', card: 'smuggling', new_text: 'Theo knows about the smuggling.' } }))).toMatch(
      /Sticky note “What if Theo already knows about the smuggling\?”: a new text\./,
    )
    const all = text(await client.callTool({ name: 'get_comments', arguments: {} }))
    expect(all).toMatch(/On the words: “The same kettle with the dent”\n  Suggests instead: “The dented kettle”\n  you \(AI assistant\), [\d-]+ [\d:]+: Fewer words\./)
    expect(all).toMatch(/Suggests a new title: “The lamp fails” \(was “The lamp goes dark”\)\n  you \(AI assistant\), [\d-]+ [\d:]+: Suggests a new title\./)
    expect(all).toMatch(/Suggests a new text: “Theo knows about the smuggling\.” \(was “What if Theo already knows about the smuggling\?”\)/)
  })

  it('says what’s wrong with a change it can’t suggest', async () => {
    const client = await connect('example')
    const call = async (args: Record<string, unknown>) => {
      const result = await client.callTool({ name: 'suggest_change', arguments: args })
      expect(result.isError).toBe(true)
      return text(result)
    }
    expect(await call({ new_text: 'x' })).toMatch(/Name what to change/)
    expect(await call({ beat: 'the lamp goes dark', new_text: 'x' })).toMatch(/Name the field to change\. What can be changed: title, description \(its notes\), when\./)
    expect(await call({ arc: 'theo', field: 'summary', new_text: 'x' })).toMatch(/There’s no summary to change on Arc “[^”]+”\. What can be changed: name, description\./)
    expect(await call({ beat: 'the lamp goes dark', field: 'title', new_text: 'The lamp goes dark' })).toMatch(/That’s what its title says already/)
    expect(await call({ beat: 'the lamp goes dark', field: 'title', new_text: '  ' })).toMatch(/A title can’t be empty/)
    expect(await call({ chapter: '3', quote: 'The same kettle with the dent', field: 'title', new_text: 'x' })).toMatch(/changed by its words alone/)
    expect(await call({ chapter: '3', quote: 'The same kettle with the dent', new_text: 'The same kettle with the dent' })).toMatch(/says already/)
    expect(await call({ chapter: '3', quote: 'words that are nowhere', new_text: 'x' })).toMatch(/Those words aren’t in Chapter 3/)
    expect(await call({ mind_map: 'who knows', new_text: 'x' })).toMatch(/Name the card on the mind map/)
  })

  it('comments through the account, on the draft asked for, and reads that draft', async () => {
    let data = buildSampleStory()
    ;[data] = newDraft(data, { copy: true, name: 'Second draft' })
    data = ops.updateChapter(data, data.chapters[0].id, { title: 'A new beginning' })
    const comments: Record<string, unknown>[] = []
    const store = fakeStore([{ id: 's1', title: 'The Lighthouse at Gull Point', updated_at: '2026-10-08T10:00:00Z', data }], comments)
    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp/${KEY}`), {
        fetch: async (url, init) => {
          const original = globalThis.fetch
          globalThis.fetch = store
          try {
            return await handleRequest(new Request(url, init), STORE)
          } finally {
            globalThis.fetch = original
          }
        },
      }),
    )
    clients.push(client)
    // The open draft by default; another by name.
    expect(text(await client.callTool({ name: 'read_chapter', arguments: { chapter: '1' } }))).toMatch(/^# Chapter 1: A new beginning/)
    expect(text(await client.callTool({ name: 'read_chapter', arguments: { chapter: '1', draft: 'first' } }))).toMatch(/^# Chapter 1: The Storm/)
    expect(text(await client.callTool({ name: 'read_chapter', arguments: { chapter: '1', draft: 'third' } }))).toMatch(/No draft “third”\. The drafts are: “First draft”, “Second draft”\./)
    expect(text(await client.callTool({ name: 'add_comment', arguments: { chapter: '1', comment: 'Tighter than before.' } }))).toMatch(/on Chapter 1: A new beginning/)
    expect(comments[0]).toMatchObject({ story: 's1', target: { kind: 'chapter', draft: data.draft, label: 'Chapter 1: A new beginning' }, body: 'Tighter than before.' })
    // That comment is the second draft's: the first's don't show it, but say it's there.
    expect(text(await client.callTool({ name: 'get_comments', arguments: { draft: 'first' } }))).toMatch(/1 open comment on other drafts: “Second draft”/)
    expect(text(await client.callTool({ name: 'reply_to_comment', arguments: { comment_id: 'c9', reply: 'x' } }))).toMatch(/No comment c9/)
    expect(text(await client.callTool({ name: 'resolve_comment', arguments: { comment_id: 'c1' } }))).toBe('Comment c1 resolved.')
    expect(comments[0].resolved_at).toBeTruthy()
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
