# Story Builder

A planning board for writers. Lay your book out chapter by chapter and drag
colour-coded story beats into place, Trello-style.

It has three views: the **chapter board**, the **manuscript** and the
**mind map**.

- **Chapters** are columns with a number, title and summary at the top.
  Add beats straight into a chapter, drag beats between chapters, and drag a
  chapter by its "Chapter N" label to reorder the book (numbers update
  automatically).
- **Beats** are cards, colour-coded by the **arc** they belong to. Click a
  beat to edit its title and notes, or to change its arc or chapter.
- **Arcs sidebar** (left, collapsible) lists every arc. Click an arc to
  expand its beats in order: a number shows the chapter a beat is in, and a
  dashed circle means it isn't in a chapter yet. Drag beats from here onto
  the board. Dropping a board beat on the sidebar takes it back out of its
  chapter. Hovering an arc dims every other arc's beats on the board.
- **Arc pages** (the ↗ next to an arc) show all of an arc's beats in order.
  Add new beats (they start unplaced), drag to reorder, and pick a chapter
  from each beat's chapter pill. Assign the characters involved in the arc.
- **Characters** live in the sidebar's Characters tab. Each has a colour and
  a page with your own attributes (age, wants, secrets, anything), their
  arcs, the chapters told from their point of view, and everywhere they're
  mentioned. Hovering a character dims beats they aren't part of.
- **Point of view**: pick a chapter's POV character from its header; the
  chapter takes on that character's colour.
- **@mentions**: type `@` in any text to mention a character (or create a
  new one). Mentions show as the name in the character's colour, and renaming
  a character updates every mention.
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
  resize them) and text boxes in three sizes, both with `@` mentions. Notes
  and text boxes can become a bulleted, numbered or tick-box list, and text
  boxes can have a background colour (white included). Drag from the dot on a card's edge to another card to draw a
  line, then select the line to label it or give it an arrow. Lines can also
  start from, or end on, a single row inside a card: hover a beat, an
  attribute, a paragraph on a chapter's page or a list item, and drag from the
  dot at its side. Let go anywhere on a card or row to join it. While that row
  isn't showing (card closed, scrolled away, another page) its lines attach to
  the card, and a paragraph's lines follow it when text is added above it. Pan by dragging
  the board, zoom with the wheel, a pinch or the buttons. Delete removes a
  card from the map only; the story item stays.
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

Your story saves automatically in the browser (IndexedDB) as you type, and
stays when the app is updated. Copies are also kept in the browser before each app
update, twice a day while you work, and before the story is replaced; restore
one from **⋯ → Backups**. The same menu exports the story as JSON (the way to
move it to another browser or device), imports it again, or starts a blank
story.

## Hosting

Live at **https://story-builder-flame.vercel.app**. It's a static site
deployed on Vercel from this repository: every push to the production branch
redeploys it. Stories live in each visitor's
browser, so updates never touch them.

## Development

```sh
npm install
npm run dev      # start the dev server
npm test         # unit tests (vitest)
npm run lint     # oxlint
npm run build    # type-check and build to dist/
```

Built with React, TypeScript and Vite. Drag and drop uses
[dnd-kit](https://dndkit.com), state uses [zustand](https://zustand.docs.pmnd.rs),
the manuscript editor uses [TipTap](https://tiptap.dev) and the mind map uses
[React Flow](https://reactflow.dev).
The build uses hash routing and relative paths, so `dist/` can be served from
any static host or sub-folder.

### Layout

- `src/types.ts`: the data model (story → chapters, arcs, beats, characters,
  chapter texts, mind map)
- `src/store/storyOps.ts`: pure, tested operations that keep beats, arcs
  and chapters in sync
- `src/store/storyStore.ts`: the persisted store wrapping those operations
- `src/pages/BoardPage.tsx`: the chapter board and its drag-and-drop logic
- `src/pages/ArcPage.tsx`: a single arc's page
- `src/pages/CharacterPage.tsx`: a single character's page
- `src/pages/WritePage.tsx` and `src/editor/`: the manuscript editor (TipTap),
  its beat links, mentions and beats checklist
- `src/map/`: the mind map (React Flow canvas, its cards, notes, lines and
  the add-to-map panel)
- `src/store/persistence.ts`: saving to IndexedDB (batched writes, migration
  from older saves); `src/store/backups.ts`: automatic backups
- `src/components/Sidebar.tsx`: the arcs / characters sidebar
- `src/lib/mentions.ts` and `src/components/MentionTextarea.tsx`: how
  `@mentions` are stored (as character ids) and edited
