# Story Builder

A planning board for writers. Lay your book out chapter by chapter and drag
colour-coded story beats into place, Trello-style.

This first version is the **chapter board**:

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
  new one). Mentions are highlighted in the character's colour, and renaming
  a character updates every mention.

Your story saves automatically in the browser as you type, and stays when
the app is updated. Copies are also kept in the browser before each app
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
[dnd-kit](https://dndkit.com), state uses [zustand](https://zustand.docs.pmnd.rs).
The build uses hash routing and relative paths, so `dist/` can be served from
any static host or sub-folder.

### Layout

- `src/types.ts`: the data model (story → chapters, arcs, beats)
- `src/store/storyOps.ts`: pure, tested operations that keep beats, arcs
  and chapters in sync
- `src/store/storyStore.ts`: the persisted store wrapping those operations
- `src/pages/BoardPage.tsx`: the chapter board and its drag-and-drop logic
- `src/pages/ArcPage.tsx`: a single arc's page
- `src/pages/CharacterPage.tsx`: a single character's page
- `src/components/Sidebar.tsx`: the arcs / characters sidebar
- `src/lib/mentions.ts` and `src/components/MentionTextarea.tsx`: how
  `@mentions` are stored (as character ids) and edited
