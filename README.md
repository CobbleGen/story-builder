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
  from each beat's chapter pill.

Your story is saved in the browser (localStorage). Use the **⋯** menu
(top right) to export it as JSON, import it again, or start a blank story.

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
- `src/components/Sidebar.tsx`: the arcs sidebar
