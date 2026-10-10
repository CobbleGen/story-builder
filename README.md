# Story Builder

A planning board for writers. Lay your book out chapter by chapter and drag
colour-coded story beats into place, Trello-style.

It has four views: the **chapter board**, the **manuscript**, the
**mind map** and the **timeline**. Signed in, you can also let an AI
assistant such as Claude read all of it and give you feedback (see
[AI assistants](#ai-assistants)).

- **Chapters** are columns with a number, title and summary at the top.
  Add beats straight into a chapter, drag beats between chapters, and drag a
  chapter by its "Chapter N" label to reorder the book (numbers update
  automatically). Each chapter has a **status** (outline, draft, revised,
  done) shown as a coloured pill, and can have a word target.
- **Beats** are cards, colour-coded by the **arc** they belong to. Click a
  beat to edit its title and notes, or to change its arc or chapter.
- **Arcs sidebar** (left, collapsible) lists every arc. Click an arc to
  expand its beats in order: a number shows the chapter a beat is in, and a
  dashed circle means it isn't in a chapter yet. Drag beats from here onto
  the board. Dropping a board beat on the sidebar takes it back out of its
  chapter. Hovering an arc dims every other arc's beats on the board.
- **Moving a beat to another arc** on the board: drop it (from the board or
  the sidebar) on another arc's name in the sidebar, or click the arc's
  name on its card and pick one. It stays in its chapter, and keeps when it
  happens.
- **Arc pages** (the ↗ next to an arc, or double-click the arc) show all of an arc's beats in order.
  Add new beats (they start unplaced), drag to reorder, and pick a chapter
  from each beat's chapter pill. Assign the characters involved in the arc.
  The link at the top of arc, character and place pages goes back to where
  you came from, named (the timeline, the mind map, another arc…), scrolled
  as you left it; deleting the arc goes back there too.
- **Characters** live in the sidebar's Characters tab. Each has a colour and
  a page with your own attributes (age, wants, secrets, anything), their
  arcs, the chapters told from their point of view, and everywhere they're
  mentioned. Hovering a character dims beats they aren't part of.
- **Point of view**: pick a chapter's POV character from its header (on the
  board, an unset one shows when you're at the chapter); the chapter takes
  on that character's colour.
- **Places, objects and groups** live in the sidebar's **World** tab, sorted
  by kind (place, object, group, other). They work like characters: each has
  a colour, a page with its own attributes and suggestions for the kind, and
  a list of everywhere it's mentioned. Hovering one dims the beats that don't
  mention it.
- **Colours**: wherever a colour is picked (arcs, characters, places,
  sticky notes, text box backgrounds, containers), the row shows the colours
  used lately, latest first, and the rainbow button opens a colour wheel:
  hue around it, paler towards the middle, a brightness slider and the
  colour's code to type. Writing on dark colours turns light.
- **@mentions**: type `@` in any text to mention a character, place or thing
  (or create a new character or place from what you typed). Mentions show as
  the name in its colour, and renaming updates every mention; deleting turns
  them back into plain text.
- **Manuscript** (second tab in the top bar) is where each chapter is
  written, in a full text editor: headings, bold/italic/underline, quotes,
  lists, scene breaks, undo, smart quotes and dashes, and `@` mentions. The
  chapter's beats are a checklist on the left: tick one off, or select text
  first and tick it to colour that text in the beat's arc. A switch turns the
  arc colours on and off. Select text and choose **New beat** to make a beat
  from it. Arrows on either side move to the previous and next chapter.
- **Mind map** (third tab) is an endless board to think on. Drag chapters,
  arcs, characters and beats onto it from the panel on the left (or click
  one to drop it in the middle); the cards show the live item and open it on
  double-click. Add sticky notes (double-click the empty board, pick a colour,
  resize them) and text boxes, both with `@` mentions. Set their text size
  from the toolbar: the − and + buttons, or type a size (bigger text in a text
  box turns bolder, and from 28 up a serif title). Notes
  and text boxes can become a bulleted, numbered or tick-box list, and text
  boxes can have a background colour. Drag from the dot on a card's edge to another card to draw a
  line, then select the line to label it or give it an arrow. Lines can also
  start from, or end on, a single row inside a card: hover a beat, an
  attribute, a paragraph on a chapter's page or a list item, and drag from the
  dot at its side. Let go anywhere on a card or row to join it. While that row
  isn't showing (card closed, scrolled away, another page) its lines attach to
  the card, and a paragraph's lines follow it when text is added above it.
  Lines pass under every card, sticky note and picture except the two they
  join (and over containers). Pan by dragging
  the board, zoom with the wheel, a pinch or the buttons. Delete removes a
  card from the map only; the story item stays.
- **Containers**: add one from the panel (**Container**) and give it a title,
  shown large across its top (double-click the title, or the pen in its toolbar, to change it; `@`
  mentions work, and search finds it). Drop cards on it (from the map or the
  panel) to put them on it; drag a card off to take it off. Moving a
  container moves everything on it. By default its cards stack downwards;
  its toolbar switches to side by side, a grid (as many cards across as fit
  its width, so widening or narrowing it reflows them), or freeform, where
  cards stay wherever they're put. Resize it from its edges (stacked cards
  never spill out; it grows to fit them) and give it a colour. Containers
  go inside containers too: drop one on another and it stacks or sits there
  like any card, taking everything on it along (it's drawn over the one it's
  on, so its cards can still be picked). Deleting a container leaves its
  cards where they are, on the container it was on, or else on the map.
- **Copy and paste on the map**: select cards (click; Ctrl-click or
  Shift-drag for several) and press Ctrl+C, Ctrl+X or Ctrl+V (⌘ on a Mac) to
  copy, cut and paste them, with the lines between them, on the same map or
  another. Pasted cards land a step down and to the right (cut ones go back
  where they were) and come selected, ready to drag. Copied cards pasted into
  a text field, or another app, give their words.
- **Pictures**: on the mind map, use **Picture** in the left panel, or drop
  picture files on the board, or paste one. A picture is a card: resize it
  from its corners (it keeps its shape), draw lines to it, double-click it to
  see it full size. In the manuscript, use the picture button in the toolbar,
  or paste or drop one into the text; select it to make it small, medium or
  full width, or drag it somewhere else. Pictures in the manuscript also show
  on the mind map's chapter pages and go into Word, PDF and Markdown exports.
  Big photos are scaled down to 2000 pixels on their longest side as they're
  added. Pictures are kept in the browser apart from the story, and
  **Export story (.json)** carries them along.
- **Portraits**: a character's page has a spot for their portrait, and a
  place's or thing's page for a picture of it. Click it to pick a file, or
  drop or paste a picture on the page; click the picture to see it full size.
  The portrait then stands in for their initials (or the place's icon)
  wherever they appear: the sidebar, mind map cards, mentions and search.
- **Several mind maps**: the map's name sits at its top left; its menu
  switches maps, starts a new one, renames it or deletes it (the story items
  on it stay). Each map remembers where it was scrolled and zoomed to. Places
  and things go on maps too, and open up to their details.
- **Timeline** (fourth tab) puts every beat on one line of time, with a lane
  per arc (double-click an arc's name to open it). **Story order** is when
  things happen in the story's world: drag a beat to move it in time, and
  give beats a "when" ("The next morning") in the beat editor; runs of the
  same "when" are labelled along the top. **Reading order** is chapter by
  chapter, as readers meet them, with every chapter shown (even an empty
  one) and the beats in no chapter at the end: dragging a beat there moves
  it into that chapter, at that place among its beats, as the chapter board
  shows it. Drop a beat onto another arc's beat (in either order) and they
  happen at the same moment, one above the other, joined by a dotted line:
  one revelation closing several arcs, say. Drag it off again to part them.
  A + shows by the pointer in an arc's lane: between two beats it adds one
  right there (in story order it's in no chapter yet; in reading order it's
  in that chapter), and in the empty place above or below another arc's beat
  it adds one happening at the same time. Each arc's name has a + for a beat
  at the end of the book (in reading order, after everything else), and
  **New arc** under the lanes adds an arc. Drag a beat up or down into
  another arc's lane to move it to that arc, there in time (in the empty
  place above or below a beat, it happens at once with it; dropped right
  onto another arc's beat, it keeps its own arc and happens at once with it,
  as before); the lane lights up and the beat takes its colour. Drag an
  arc's name up or down to put the arcs in another order; nothing moves in
  time. Drag across empty space to box in several beats (Shift or Ctrl to
  add to them, or Ctrl-click beats one by one), then drag any of them to
  move them all at once, in their order; a click on empty space or Esc lets
  go. With the keyboard, Space picks a beat up, ← and → step it from place
  to place, ↑ and ↓ into another arc's lane, and Space puts it down; an
  arc's name moves with Space and ↑ ↓ too, and Enter opens it. Beats told
  out of order are marked **Flashback** or **Flash-forward**.
- **Where the book begins and ends**: in story order, two lines run through
  every lane, **Book begins** and **Book ends**, at the very beginning and
  end to start with. Drag a line (or the book at its top) to its place in
  time: what happens before it is backstory and after it aftermath, shaded
  on the timeline. While a line is dragged, the beats it would carry across
  are lit up; the beginning never passes the end. Beats moved, or added,
  outside the lines stay outside them as the story changes.
- **Chapter edges and matching the two orders**: in reading order, drag the
  line between two chapters (its grip shows on hover) to move the beats it
  passes from one chapter into the other; beats read at the same moment go
  together. **Match story order** puts the beats between the book's lines
  into the chapters in the order they happen, each chapter taking about the
  share of them it has now (all alike if they're empty), and takes beats
  outside the lines out of their chapters; it says what it will do first.
  The other way, **Match reading order** (in story order) puts the beats
  that are read back in time the way they're read, keeping backstory and
  aftermath in no chapter where they are. Either is greyed out when the two
  orders already match, and each can be undone. With the keyboard, Tab to a
  line or edge, Space to pick it up, ← and → to move it, and Space again.
- **The chapter strip**: along the top in reading order, each chapter shows
  its number, title and point of view. Drag a chapter's number to move where
  it begins, as with the line below it. Click the number or the title to
  give the chapter a title, point of view and status right there (Enter or
  Esc closes it); double-click it, or **Write** in its details, to open it
  in the manuscript. Hover the strip for a + on its lower edge: between two
  of a chapter's beats it splits the chapter there, the new chapter taking
  the beats after it; between chapters, or at either end, it adds an empty
  one. The chapters after it are renumbered, and the new one opens to be
  named.
- **Opening up cards on the mind map**: a chapter card's **Pages** button
  shows the chapter's text a page at a time (arrows or the page picker to move
  through it), and **Beats** lists its beats. An arc card lists its beats in
  order, with their chapter numbers. A character card's **Details** shows all
  their attributes, arcs, point-of-view chapters and the beats they're in.
  Hover the gap between two beats and click the + to add a beat right there,
  or use **Add beat** at the end; tick beats as written, click one to edit it,
  or drag it out onto the map. Select an opened card to resize it from its
  edges: pages re-flow to fill the new size (make it big enough and the whole
  chapter fits on one page), and **Standard size** puts it back.

- **Search** (Ctrl+K, or ⌘K on a Mac, or Search in the top bar) finds
  anything: chapters, the manuscript's text, beats, characters and their
  attributes, places and things, arcs, and notes on every mind map. Case and
  accents don't matter, and "quoted words" are found together. Pick a result
  to go straight to it: the manuscript opens with the words selected, a note
  is centred on its map, a chapter glows on the board.
- **Undo and redo** (the arrows in the top bar, Ctrl+Z and Ctrl+Shift+Z or
  Ctrl+Y, ⌘Z and ⇧⌘Z on a Mac) step through changes on the board, pages and
  mind maps; typing in one field is one step. The manuscript has the text
  editor's own undo.
- **Word counts and goals** (the target icon in the top bar, or ⋯): the whole
  draft's words, a goal for the draft and for each day, the last 30 days'
  writing as a chart (or a table), a streak, and every chapter's words
  against its target.
- **Outline words** are counted separately from the manuscript: everything
  written in beats (titles and descriptions), arcs (names and descriptions)
  and chapters' titles and summaries. The top bar shows the count next to
  the manuscript's (or alone, while there's no manuscript yet), and the
  **Outline** tab of word counts has today's and the last 7 days' outline
  words, a streak, a 30-day chart, and the words in each arc. An arc's page
  shows its words too. Words cut, or undone, come off the day's count.
- **Export the manuscript** (⋯ → Export manuscript…) as a Word document, a
  PDF (through the print window), plain text or Markdown, laid out as a
  manuscript: double spaced, each chapter on a new page, with an optional
  title page. Word files use real headings (so chapters show in Word's
  navigation pane) and put the title and page number at the top of each page.
- **Dark mode**: ⋯ → Light, Dark, or Match system.

Your story saves automatically in the browser (IndexedDB) as you type, and
stays when the app is updated. Copies are also kept in the browser before each app
update, twice a day while you work, and before the story is replaced; restore
one from **⋯ → Backups**. The same menu exports the story as JSON (the way to
move it to another browser or device), imports it again, or starts a blank
story.

### Accounts

Without an account everything works as above, in one browser. **Sign in**
(top right) with an email address and password to keep your stories in your
account as well:

- Creating an account sends an email to confirm the address; then sign in.
  Forgotten passwords are reset by email too.
- The first time you sign in, the story in the browser becomes your
  account's first story. Signing in somewhere else (another browser, another
  device) asks whether to open a story from your account there or add that
  browser's story too; the one that was there is kept in its backups.
- From then on it's saved to your account a few seconds after each change
  (pictures too), and changes made elsewhere are picked up when the app
  comes back into view, or every minute. The dot on your initial shows how
  it stands: green saved, amber saving, grey offline (changes wait in the
  browser and go up when you're back online), red needs you.
- If the same story was changed in two places before either saw the other's
  change, nothing is overwritten: you're asked which version to keep, and
  the other goes into that browser's backups.
- **Your account** lists your stories: open one, start a new one, or delete
  one you don't need. Signed in, ⋯ → New blank story, Load example story and
  Import story each add a new story to your account rather than replacing
  the one open.
- Signing out leaves the story in the browser; it just stops being saved to
  your account.

### AI assistants

An AI assistant such as Claude can read your stories (everything in them)
to give you feedback: a critique of a chapter, a check for continuity slips,
ideas for what to write next. It can only read; it never changes anything.
It reads them from your account, so sign in first, then:

1. **⋯ → AI assistants** (or the same section under your account): **New
   link**, give it a name, and copy the link. It's shown once (the account
   keeps only a fingerprint of it), so copy it then.
2. Give the link to the assistant:
   - **Claude** (on the web, desktop or phone): Settings → Connectors → Add
     custom connector; name it Story Builder and paste the link as its URL.
   - **Claude Code**: `claude mcp add --transport http story-builder <link>`
   - Any other assistant that takes a remote MCP server (Streamable HTTP).
3. Ask away: "Read my story and tell me what you think of chapter 3."

The list shows when each link was last used; **Revoke** one and it stops
working at once. Anyone who has a link can read your stories, so keep them
private. To see what an assistant gets before connecting your own stories,
use `https://story-builder-flame.vercel.app/mcp/example`, which reads the
example story (open it in a browser for the same instructions).

What the assistant can read, each as a tool:

| Tool | What it gives |
| --- | --- |
| `get_story_overview` | The whole story at a glance, where it starts: chapters (status, length, point of view, summary, beats), arcs, characters, places and things, story time in brief, mind maps, goals |
| `read_chapter` | One chapter with its plan: its beats and the passages linked to them, who's named in it, and its text (long chapters in parts) |
| `read_manuscript` | The text straight through, as much as fits in one reply, and where to carry on |
| `get_outline` | Every chapter's beats in order, beats not in a chapter yet, and each arc's beats in its own order |
| `get_timeline` | Story time: backstory before the book begins, the book, aftermath; beats happening at once; flashbacks and flash-forwards |
| `get_characters`, `get_places_and_things` | Full profiles with every detail, and everywhere each is named (the manuscript, beats, other profiles, mind maps); name one for every passage that mentions them |
| `get_mind_maps` | Every card (notes and text in full, groups and what's in them) and every line, with its label |
| `search_story` | Words anywhere in the story |
| `get_writing_progress` | Words, goals, chapter by chapter, and the last two weeks |
| `list_stories` | The stories in the account; the others read the one edited last, unless told another |

It also explains Story Builder's ideas to the assistant (beats, arcs, story
time, where the book begins and ends, mentions), and offers ready-made
requests: feedback on a chapter, feedback on the whole story, a continuity
check, and what to write next. Pictures aren't included.

## Hosting

Live at **https://story-builder-flame.vercel.app**. It's deployed on Vercel
from this repository: every push to the production branch redeploys it.
Stories live in each visitor's browser (and, signed in, in their account), so
updates never touch them. Besides the app's static files there's one
function, the story server for AI assistants at `/mcp/<key>`
(`server/mcp.ts`). The build writes both in Vercel's Build Output API format
(`scripts/vercel-output.mjs`), bundling the server into one file, since it
shares the app's own code.

The backend is a Supabase project (`story-builder`, in the CobbleWebb
organization): its sign-in (email and password), a `stories` table that
every account sees only its own rows of, and a private `pictures` bucket
with a folder per account, plus `assistant_keys` (the fingerprints of the
links for AI assistants) and two functions that read a key's account's
stories, which is all the story server can reach. `supabase/migrations/`
holds its schema. The app
finds it through `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` in `.env`
(public values: the key only lets people sign in; the row rules do the
rest). Without them the app runs as before, in the browser only.

In the Supabase dashboard (Authentication), for links in emails to come back
to the app: **URL Configuration** → Site URL
`https://story-builder-flame.vercel.app`, and Redirect URLs
`https://story-builder-flame.vercel.app/**` and `http://localhost:5173/**`.
Supabase's own mail sender is for trying things out (it sends only a few
emails an hour); for real use, set up **SMTP** with a mail service.

## Development

```sh
npm install
npm run dev      # start the dev server
npm test         # unit tests (vitest)
npm run lint     # oxlint
npm run build    # type-check, build to dist/, and write .vercel/output
```

Built with React, TypeScript and Vite. Drag and drop uses
[dnd-kit](https://dndkit.com), state uses [zustand](https://zustand.docs.pmnd.rs),
the manuscript editor uses [TipTap](https://tiptap.dev), the mind map uses
[React Flow](https://reactflow.dev) and Word export uses
[docx](https://docx.js.org).
The build uses hash routing and relative paths, so `dist/` can be served from
any static host or sub-folder.

### Layout

- `src/types.ts`: the data model (story → chapters, arcs, beats, characters,
  places and things, chapter texts, story time, mind maps, goals)
- `src/store/storyOps.ts`: pure, tested operations that keep beats, arcs
  and chapters in sync
- `src/store/storyStore.ts`: the persisted store wrapping those operations
- `src/pages/BoardPage.tsx`: the chapter board and its drag-and-drop logic
- `src/pages/ArcPage.tsx`: a single arc's page
- `src/lib/trail.ts` and `src/components/BackLink.tsx`: where you've been in
  the tab, so pages' back links (and scroll positions) take you back there
- `src/pages/CharacterPage.tsx` and `src/pages/ElementPage.tsx`: a character's
  page and a place or thing's page
- `src/pages/TimelinePage.tsx` and `src/lib/timeline.ts`: the timeline and how
  flashbacks are found
- `src/pages/WritePage.tsx` and `src/editor/`: the manuscript editor (TipTap),
  its beat links, mentions and beats checklist
- `src/map/containers.ts`: how cards stack on containers, move with them, and
  go onto and off them when dropped
- `src/map/`: the mind map (React Flow canvas, its cards, notes, lines and
  the add-to-map panel)
- `src/store/persistence.ts`: saving to IndexedDB (batched writes, migration
  from older saves); `src/store/backups.ts`: automatic backups
- `src/components/Sidebar.tsx`: the arcs / characters / world sidebar
- `src/lib/mentions.ts` and `src/components/MentionTextarea.tsx`: how
  `@mentions` are stored (as ids) and edited
- `src/lib/search.ts` and `src/components/SearchDialog.tsx`: search
- `src/lib/manuscript.ts` and `src/lib/docxExport.ts`: manuscript export
  (the Word library loads only when exporting)
- `src/store/history.ts`: undo and redo
- `src/cloud/`: accounts and sync. `engine.ts` keeps the browser's story in
  step with the account (tested against an in-memory backend in
  `engine.test.ts`), `supabaseBackend.ts` talks to Supabase (loaded only
  when someone signs in), and `index.ts` wires them to the app;
  `src/components/Account.tsx` is the account button and dialog
- `server/` and `src/reader/`: the story server for AI assistants.
  `src/reader/` tells a story in words (the overview, chapters with their
  plans, outline, story time, profiles, mind maps, search, progress), from
  the app's own code; `server/mcp.ts` offers that as MCP tools, prompts and
  instructions over HTTP, a fresh server per request; `server/sources.ts`
  reads an account's stories by key, or the example story; and
  `server/vercel.ts` is the function Vercel runs. `server/mcp.test.ts`
  connects to it with an MCP client
- `src/store/images.ts` and `src/lib/pictures.ts`: the picture store (its own
  IndexedDB database) and adding pictures; `src/editor/picture.ts` and
  `src/map/PictureNode.tsx` show them
