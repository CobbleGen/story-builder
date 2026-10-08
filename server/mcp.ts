import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { normalizeStory } from '../src/store/storyOps'
import * as reader from '../src/reader'
import { findByName } from '../src/reader/story'
import { EXAMPLE_KEY, InvalidKey, accountSource, exampleSource, looksLikeKey, type AccountStore, type StorySource } from './sources'

// An MCP server that lets an AI assistant read a writer's stories (never
// change them): the manuscript, chapters, beats and arcs, story time,
// characters, places and things, and mind maps, each told in words with
// everything that connects them. It runs at /mcp/<key> (see server/vercel.ts),
// a fresh server for each request.

/** What the assistant is told about Story Builder before it reads anything. */
export const INSTRUCTIONS = `Story Builder is a writing app for novels and other long stories. Through this server you can read a writer's stories: everything they have written and planned. You can't change anything.

How a story is organised:
- Chapters, in reading order, hold the manuscript. Each has a status (outline, draft, revised or done), and may have a summary, a word target and a point-of-view character.
- Beats are the planned events of the story. Each belongs to an arc (a storyline, plot thread or relationship) and is placed in a chapter, in order, or not placed yet. The writer ticks a beat off when it's written, and can link it to the passage that tells it.
- Story time is the order things happen in the story's world, which can differ from the reading order (flashbacks, flash-forwards). Beats in different arcs can share a moment, happening at once. Two lines mark where the book begins and ends in story time: beats before are backstory, beats after are aftermath. A beat's "when" is the writer's own note ("The next morning").
- Characters, and places, objects and groups, have a description and details the writer defines (Age, Wants, Fears…). Names in any text can be links (@mentions) to them.
- Mind maps are free-form boards: cards for story items, sticky notes, text, pictures and groups, with lines between them (often labelled). They show how the writer thinks about relationships and structure.
- Pictures are in the stories but can't be shown here.

Start with get_story_overview, then read what the question needs: read_chapter for a chapter with its plan, read_manuscript for the text straight through, and the other tools for the outline, story time, characters, places and things, mind maps, search and writing progress. When the account has several stories, each tool reads the one edited most recently unless you name another (list_stories lists them).

When you give feedback, quote the writer's own words and name the chapters and beats you mean. Respect their intentions, voice and genre, and remember an outline or draft is unfinished: say what matters most first.`

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

const storyArg = z
  .string()
  .optional()
  .describe('Which story, by title (or id), when there are several. Leave it out for the one edited most recently.')

type Reply = { content: { type: 'text'; text: string }[]; isError?: boolean }
const reply = (text: string, isError = false): Reply => (isError ? { content: [{ type: 'text', text }], isError } : { content: [{ type: 'text', text }] })

/** The MCP server for one source of stories. `today` is the date (YYYY-MM-DD) for writing progress. */
export function createServer(source: StorySource, today: () => string = () => new Date().toISOString().slice(0, 10)): McpServer {
  const server = new McpServer({ name: 'story-builder', title: 'Story Builder', version: '1.0.0' }, { instructions: INSTRUCTIONS })

  /** The story asked for (or the one edited last), ready to read; and a note saying which, when there are others. */
  async function open(ref: string | undefined) {
    const rows = await source.list()
    if (!rows.length) throw new reader.NotFound('There are no stories here yet. A story is here once it’s saved to the writer’s Story Builder account.')
    const row = ref?.trim() ? findByName(rows, ref, (r) => r.title, (r) => r.id) : rows[0]
    if (!row) throw new reader.NotFound(`No story “${ref}”. The stories are: ${rows.map((r) => `“${r.title || 'Untitled story'}”`).join(', ')}.`)
    const data = await source.load(row.id)
    if (!data) throw new reader.NotFound(`“${row.title || 'Untitled story'}” isn’t there any more.`)
    const note = rows.length > 1 && !ref?.trim() ? `(From “${row.title || 'Untitled story'}”, the most recently edited of ${rows.length} stories; name another with the story argument.)\n\n` : ''
    return { story: reader.storyOf(normalizeStory(data)), note }
  }

  /** A tool that reads one story: its reply is the text, or what couldn't be found. */
  function reading<A extends object>(read: (story: reader.Story, args: A) => string) {
    return async (args: A): Promise<Reply> => {
      try {
        const { story, note } = await open((args as { story?: string }).story)
        return reply(note + read(story, args))
      } catch (error) {
        if (error instanceof reader.NotFound) return reply(error.message, true)
        throw error
      }
    }
  }

  server.registerTool(
    'list_stories',
    {
      title: 'List stories',
      description: 'The writer’s stories, most recently edited first. The other tools read the first one unless given another’s title.',
      annotations: READ_ONLY,
    },
    async () => {
      const rows = await source.list()
      if (!rows.length) return reply('There are no stories here yet.')
      const when = (iso: string) => (Date.parse(iso) > 0 ? `, last saved ${iso.slice(0, 16).replace('T', ' ')} UTC` : '')
      return reply(rows.map((r, i) => `${i + 1}. ${r.title || 'Untitled story'}${when(r.updatedAt)}${i === 0 ? ' (read by default)' : ''}`).join('\n'))
    },
  )

  server.registerTool(
    'get_story_overview',
    {
      title: 'Story overview',
      description:
        'Start here. The whole story at a glance: chapters in reading order (status, length, point of view, summary, planned beats), beats not placed yet, arcs, characters, places and things, story time in brief, mind maps, goals.',
      inputSchema: { story: storyArg },
      annotations: READ_ONLY,
    },
    reading((story) => reader.overview(story)),
  )

  server.registerTool(
    'read_chapter',
    {
      title: 'Read a chapter',
      description:
        'One chapter: its status, length and target, point of view, summary, the beats planned for it (with the passages the writer linked to them), who is named in it, and its full text. Long chapters come in parts.',
      inputSchema: {
        chapter: z.string().describe('The chapter’s number (e.g. "3") or title.'),
        part: z.number().int().min(1).optional().describe('For long chapters, which part to read (1 first).'),
        story: storyArg,
      },
      annotations: READ_ONLY,
    },
    reading((story, { chapter, part }: { chapter: string; part?: number }) => reader.readChapter(story, chapter, part ?? 1)),
  )

  server.registerTool(
    'read_manuscript',
    {
      title: 'Read the manuscript',
      description:
        'The text of the chapters straight through, in reading order, as much as fits in one reply (about 15,000 tokens); it says where to carry on. For the plan around a chapter, use read_chapter.',
      inputSchema: {
        from_chapter: z.number().int().min(1).optional().describe('The first chapter to read (1 if left out).'),
        to_chapter: z.number().int().min(1).optional().describe('The last chapter to read (the last one if left out).'),
        story: storyArg,
      },
      annotations: READ_ONLY,
    },
    reading((story, { from_chapter, to_chapter }: { from_chapter?: number; to_chapter?: number }) =>
      reader.readManuscript(story, from_chapter ?? 1, to_chapter),
    ),
  )

  server.registerTool(
    'get_outline',
    {
      title: 'Outline',
      description:
        'The plan: every chapter with its beats in order (arc, when, written or not, beats happening at once, flashbacks), the beats not in a chapter yet, and every arc with its description, characters and beats in the arc’s own order.',
      inputSchema: { story: storyArg },
      annotations: READ_ONLY,
    },
    reading((story) => reader.outline(story)),
  )

  server.registerTool(
    'get_timeline',
    {
      title: 'Story time',
      description:
        'Every beat in the order it happens in the story’s world (which can differ from the reading order): backstory before where the book begins, the book, aftermath after it ends, beats happening at the same moment, "when" notes, and which beats are told out of order (flashbacks, flash-forwards).',
      inputSchema: { story: storyArg },
      annotations: READ_ONLY,
    },
    reading((story) => reader.timeline(story)),
  )

  server.registerTool(
    'get_characters',
    {
      title: 'Characters',
      description:
        'Every character’s profile: description, the details the writer keeps (age, wants, fears…), chapters told from their point of view, arcs they’re in, where they’re named (manuscript, beats, other profiles) and their lines on the mind maps. Give a name for one character in depth, with every passage that names them.',
      inputSchema: { name: z.string().optional().describe('A character’s name, for that character in depth.'), story: storyArg },
      annotations: READ_ONLY,
    },
    reading((story, { name }: { name?: string }) => reader.characters(story, name)),
  )

  server.registerTool(
    'get_places_and_things',
    {
      title: 'Places, objects and groups',
      description:
        'Every place, object and group the story keeps track of, with its description, details, where it’s named and its lines on the mind maps. Give a name for one in depth, with every passage that names it.',
      inputSchema: { name: z.string().optional().describe('A place’s, object’s or group’s name, for that one in depth.'), story: storyArg },
      annotations: READ_ONLY,
    },
    reading((story, { name }: { name?: string }) => reader.placesAndThings(story, name)),
  )

  server.registerTool(
    'get_mind_maps',
    {
      title: 'Mind maps',
      description:
        'The writer’s mind maps: every card (story items, sticky notes and text in full, groups and what’s in them) roughly from the top left, and every line between cards with its label.',
      inputSchema: { name: z.string().optional().describe('A map’s name, for that one only.'), story: storyArg },
      annotations: READ_ONLY,
    },
    reading((story, { name }: { name?: string }) => reader.mindMaps(story, name)),
  )

  server.registerTool(
    'search_story',
    {
      title: 'Search the story',
      description:
        'Finds words anywhere in the story: the manuscript (by chapter and paragraph), chapters, beats, characters, places and things, arcs and mind map notes. Every word must be found; put "quotes" around words to find them together. Not case or accent sensitive.',
      inputSchema: { query: z.string().min(1).describe('What to find.'), story: storyArg },
      annotations: READ_ONLY,
    },
    reading((story, { query }: { query: string }) => reader.searchStory(story, query)),
  )

  server.registerTool(
    'get_writing_progress',
    {
      title: 'Writing progress',
      description: 'Words written, goals and how close they are, each chapter’s status and length against its target, beats written, and words written each day for the last two weeks.',
      inputSchema: { story: storyArg },
      annotations: READ_ONLY,
    },
    reading((story) => reader.progress(story, today())),
  )

  const ask = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] })

  server.registerPrompt(
    'review_chapter',
    {
      title: 'Feedback on a chapter',
      description: 'An editor’s feedback on one chapter of the story.',
      argsSchema: { chapter: z.string().describe('The chapter’s number or title.') },
    },
    ({ chapter }) =>
      ask(
        `Please give me editorial feedback on chapter ${chapter} of my story in Story Builder. First read the story overview, then the chapter (read_chapter), and as much around it as you need: the characters in it, the outline around it, and the chapters before it if it carries on from them. Then tell me what's working and what could be stronger: pacing, tension, clarity, point of view, voice and dialogue, description. Check that it delivers the beats planned for it and fits what comes before and after. Quote the passages you mean and suggest concrete revisions for the most important ones. It may be an early draft, so say what matters most first.`,
      ),
  )

  server.registerPrompt(
    'review_story',
    { title: 'Feedback on the whole story', description: 'Big-picture feedback, as from a developmental editor.' },
    () =>
      ask(
        `Please read my story in Story Builder and give me big-picture feedback, the way a developmental editor would. Start with the story overview, then read what's written (read_manuscript), the outline, story time, the characters, places and things, and the mind maps. Tell me about the structure and pacing, each arc's shape and payoff, the characters (what they want, how they change, whether they're consistent), the stakes and tension, and anything confusing or missing. Point to specific chapters and beats, and finish with the three changes that would help the story most.`,
      ),
  )

  server.registerPrompt(
    'check_continuity',
    { title: 'Check continuity', description: 'Finds contradictions in the story: facts, timeline, who knows what.' },
    () =>
      ask(
        `Please check my story in Story Builder for continuity problems: places where the text contradicts the characters' or places' details, the timeline (when things happen, who is where, who knows what and when), the outline, or itself. Read the overview, story time, the characters, places and things, and the written chapters. List each problem with where it is (chapter and a quote) and what it contradicts, most serious first. Tell me if you find none.`,
      ),
  )

  server.registerPrompt(
    'whats_next',
    { title: 'What to write next', description: 'Suggestions for what to write next, from the plan and the progress so far.' },
    () =>
      ask(
        `Please look at my story in Story Builder and help me decide what to write next. Read the overview, the outline (which beats are written, which chapters are still outlines, which beats aren't in a chapter yet), story time and my writing progress. Suggest the next scenes or chapters to write and why, and point out gaps in the plan: arcs that stop short, characters without an arc, beats not placed in a chapter, threads that never pay off.`,
      ),
  )

  return server
}

// ---------- Over HTTP ----------

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

/** A JSON-RPC error over HTTP, for requests refused before the MCP server sees them. */
const refuse = (status: number, message: string) =>
  withCors(Response.json({ jsonrpc: '2.0', error: { code: -32001, message }, id: null }, { status }))

const BAD_LINK =
  'This Story Builder link doesn’t work: it may have been revoked, or not copied whole. Make a new one in Story Builder (your account → AI assistants).'

/** The key from /mcp/<key>, ?key= (as Vercel's routing passes it on), or an Authorization: Bearer header. */
export function keyOf(request: Request): string | null {
  const url = new URL(request.url)
  const inPath = /\/mcp\/([^/]+)\/?$/.exec(url.pathname)?.[1]
  const key = inPath ? decodeURIComponent(inPath) : url.searchParams.get('key')
  if (key) return key
  const auth = request.headers.get('authorization')
  return auth?.startsWith('Bearer ') ? auth.slice(7).trim() || null : null
}

/** The stories a key reads, or null when it can't be one. */
export function sourceFor(key: string | null, store: AccountStore | null): StorySource | null {
  if (key === EXAMPLE_KEY) return exampleSource()
  if (!key || !looksLikeKey(key) || !store) return null
  return accountSource(key, store)
}

/** Answers one HTTP request to /mcp/<key>. */
export async function handleRequest(request: Request, store: AccountStore | null, today?: () => string): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const key = keyOf(request)
  const source = sourceFor(key, store)

  if (request.method === 'GET' && (request.headers.get('accept') ?? '').includes('text/html')) return infoPage(request, key, source)
  // No event stream to listen to, and no sessions to end: everything happens in POSTs.
  if (request.method !== 'POST') return withCors(new Response('Method not allowed', { status: 405, headers: { allow: 'POST, OPTIONS' } }))
  if (!source) return refuse(403, BAD_LINK)
  try {
    await source.list()
  } catch (error) {
    if (error instanceof InvalidKey) return refuse(403, BAD_LINK)
    return refuse(502, `Couldn’t reach the stories just now (${error instanceof Error ? error.message : String(error)}). Try again in a moment.`)
  }

  const server = createServer(source, today)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    return withCors(await transport.handleRequest(request))
  } finally {
    void server.close()
  }
}

// ---------- A page for people who open the link in a browser ----------

/** What the tools are called, asked of the server itself (so the page also shows the server works). */
async function toolTitles(source: StorySource): Promise<string[]> {
  const server = createServer(source)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    const response = await transport.handleRequest(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    )
    const body = (await response.json()) as { result?: { tools: { name: string; title?: string }[] } }
    return body.result?.tools.map((t) => t.title ?? t.name) ?? []
  } finally {
    void server.close()
  }
}

/** The site's address as visitors see it: behind Vercel's proxy, requests reach the function over plain http. */
export function publicOrigin(request: Request): string {
  const url = new URL(request.url)
  const forwarded = (name: string) => request.headers.get(name)?.split(',')[0].trim()
  const proto = forwarded('x-forwarded-proto')
  return `${proto === 'https' || proto === 'http' ? proto : url.protocol.slice(0, -1)}://${forwarded('x-forwarded-host') || url.host}`
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function infoPage(request: Request, key: string | null, source: StorySource | null): Promise<Response> {
  const origin = publicOrigin(request)
  const link = key ? `${origin}/mcp/${encodeURIComponent(key)}` : `${origin}/mcp`
  let status: string
  let ok = false
  if (!source) status = BAD_LINK
  else {
    try {
      const rows = await source.list()
      ok = true
      const titles = rows.map((r) => `<li>${escape(r.title || 'Untitled story')}</li>`).join('')
      status =
        key === EXAMPLE_KEY
          ? `This link reads the example story, <em>${escape(rows[0]?.title ?? '')}</em>, so you can try it out.`
          : rows.length
            ? `This link reads the stories in a Story Builder account:<ul>${titles}</ul>`
            : 'This link reads a Story Builder account that has no stories in it yet.'
    } catch (error) {
      status = error instanceof InvalidKey ? BAD_LINK : 'Couldn’t reach the stories just now. Try again in a moment.'
    }
  }
  const tools = ok && source ? await toolTitles(source) : []
  const how = ok
    ? `<h2>Connect an assistant</h2>
<ul>
<li><strong>Claude</strong> (on the web, desktop or phone): Settings → Connectors → Add custom connector. Give it a name, paste this link as its URL, and add it.</li>
<li><strong>Claude Code</strong>: <code>claude mcp add --transport http story-builder ${escape(link)}</code></li>
<li><strong>Other assistants</strong>: add it as a remote MCP server (Streamable HTTP) at this link.</li>
</ul>
<p>Then ask, for example: <em>“Read my story and tell me what you think of chapter 3.”</em></p>
<h2>What it can read</h2>
<p>${tools.map(escape).join(' · ')}</p>
<p class="small">The assistant can read everything in the stories (the manuscript, chapters, beats, arcs, timeline, characters, places and mind maps) but can’t change anything. Keep the link private: anyone who has it can read your stories. You can revoke it in Story Builder, under your account.</p>`
    : ''
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Story Builder for AI assistants</title>
<style>
:root { color-scheme: light dark; }
body { max-width: 640px; margin: 48px auto; padding: 0 20px; font: 16px/1.55 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #26241f; background: #f3f1ec; }
h1 { font: 600 26px/1.25 Georgia, serif; margin: 0 0 16px; }
h2 { font-size: 17px; margin: 28px 0 8px; }
code { padding: 2px 5px; border-radius: 5px; background: rgba(0,0,0,0.07); font-size: 13px; word-break: break-all; }
li { margin: 6px 0; }
.small { color: #5f5a52; font-size: 14px; }
@media (prefers-color-scheme: dark) { body { color: #ebe7df; background: #1c1b19; } .small { color: #b9b3a8; } code { background: rgba(255,255,255,0.1); } }
</style>
</head>
<body>
<h1>Story Builder for AI assistants</h1>
<p>${status}</p>
${how}
</body>
</html>`
  return withCors(new Response(html, { status: ok ? 200 : 403, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }))
}
