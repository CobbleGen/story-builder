export interface Beat {
  id: string
  arcId: string
  /** Text fields may contain mentions of characters and elements, stored as `@{<id>}`. */
  title: string
  description: string
  /** The chapter this beat is placed in, or null while it only lives on its arc. */
  chapterId: string | null
  /** Ticked off in the manuscript: the beat has been written. */
  done: boolean
  /** When it happens in the story's world ("Day 3, evening"), if the writer has said. */
  when?: string
  /**
   * Beats that happen at the same time (in different arcs) share a moment:
   * they stand on top of each other on the timeline.
   */
  moment?: string
  /**
   * A beat that lasts a while in story time lasts until another, later beat:
   * through that beat's moment (and any added in between).
   */
  until?: string
}

export interface Chapter {
  id: string
  title: string
  summary: string
  /** Beats in the order they happen within the chapter. */
  beatIds: string[]
  /** The character whose point of view the chapter is told from. */
  povCharacterId: string | null
  /** Words the writer is aiming for in this chapter, if they've set a target. */
  targetWords?: number
}

export interface Arc {
  id: string
  name: string
  color: string
  description: string
  /** Beats in the order they happen within the arc. */
  beatIds: string[]
  /** Characters involved in this arc. */
  characterIds: string[]
  /** A common story structure laid over the arc, if the writer chose one. */
  outline?: ArcOutline
}

/** A common story structure laid over an arc (see lib/outlines): the beat each of its steps is on. */
export interface ArcOutline {
  /** Which structure. */
  kind: string
  /** Step id → the beat (of this arc) it's on; a step not here isn't on a beat yet. */
  steps: Record<string, string>
}

export interface CharacterAttribute {
  id: string
  label: string
  value: string
}

export interface Character {
  id: string
  name: string
  color: string
  description: string
  /** Free-form attributes the writer defines (age, wants, fears…), in order. */
  attributes: CharacterAttribute[]
  /** Their portrait: a picture's id (pictures are kept apart from the story). */
  portrait?: string
}

/** What sort of thing a story element is. */
export type ElementKind = 'place' | 'object' | 'group' | 'other'

/**
 * A place, object, group or anything else the story keeps track of. Works
 * like a character: it has a page, attributes, and can be @mentioned.
 */
export interface StoryElement {
  id: string
  kind: ElementKind
  name: string
  color: string
  description: string
  attributes: CharacterAttribute[]
  /** A picture of it, by id. */
  portrait?: string
}

/** A ProseMirror/TipTap JSON node, as stored. */
export interface RichNode {
  type: string
  attrs?: Record<string, unknown>
  content?: RichNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

/** A chapter's written text. */
export interface ChapterText {
  doc: RichNode
  words: number
  updatedAt: number
}

/** Story items that can be placed on the mind map; the card shows the live item. */
export type MapEntityKind = 'arc' | 'chapter' | 'character' | 'element' | 'beat'
/** A sticky note's, text box's or container's colour, as #rrggbb (older saves name one, like 'yellow'). */
export type NoteColor = string
/**
 * How a container lays out the cards on it: in a column, in a row, in a grid
 * as wide as the container, or wherever they're put.
 */
export type ContainerLayout = 'vertical' | 'horizontal' | 'grid' | 'free'
/** A text box shown as a list: each line is an item. */
export type MapListStyle = 'bullet' | 'number' | 'check'
/** What an opened-up card shows: a chapter's pages, the beats of a chapter or arc, or a character's details. */
export type MapCardView = 'text' | 'beats' | 'details'
/** A card's size on the map, when the writer has set one. */
export interface MapSize {
  width: number
  height: number
}

export type MapNode =
  | {
      id: string
      kind: MapEntityKind
      refId: string
      x: number
      y: number
      /** Chapters open up to their pages or beats, arcs to their beats, characters and elements to their details. */
      expanded?: MapCardView
      /** Sizes the writer gave the card while opened up, per view. */
      sizes?: Partial<Record<MapCardView, MapSize>>
      /** The container it's on, if any; then x and y are from that container's top-left corner. */
      containerId?: string
    }
  | {
      id: string
      kind: 'note'
      x: number
      y: number
      width: number
      height: number
      text: string
      color: NoteColor
      /** Text size in pixels; the usual size when absent. */
      size?: number
      list?: MapListStyle
      /** Ticked items of a checklist, by line. */
      checked?: number[]
      containerId?: string
    }
  | {
      id: string
      kind: 'text'
      x: number
      y: number
      width: number
      text: string
      /** Text size in pixels. */
      size: number
      /** Background colour; none when absent. */
      bg?: NoteColor
      list?: MapListStyle
      /** Ticked items of a checklist, by line. */
      checked?: number[]
      containerId?: string
    }
  | {
      id: string
      kind: 'image'
      x: number
      y: number
      width: number
      height: number
      /** The picture, in the picture store (store/images). */
      imageId: string
      containerId?: string
    }
  | {
      /**
       * A see-through area that cards (and other containers) are put on:
       * they move with it, and stack in a column, a row or a grid unless it's
       * freeform. Cards on it say so with their containerId; stacked, they go
       * in the map's order.
       */
      id: string
      kind: 'container'
      x: number
      y: number
      /** Shown along its top; may have @mentions. */
      title: string
      /** The size it was given; it grows to fit cards stacked on it. */
      width: number
      height: number
      color: NoteColor
      layout: ContainerLayout
      /** The container it's on, if any (as for cards). */
      containerId?: string
    }

/** A line between two things on the mind map. */
export interface MapEdge {
  id: string
  source: string
  target: string
  label: string
  arrow: boolean
  /** Where inside each card the line attaches (see lib/anchors); the card itself when absent. */
  sourceAnchor?: string
  targetAnchor?: string
}

export interface MindMap {
  id: string
  name: string
  nodes: MapNode[]
  edges: MapEdge[]
}

/** A writing sprint, once it's over: a timed burst of writing. */
export interface SprintRecord {
  /** When it started (ms since 1970). */
  at: number
  /** How long it was set for. */
  minutes: number
  /** How long it ran (less, if stopped early). */
  seconds: number
  /** Words added to the manuscript during it. */
  words: number
  /** The words it aimed for, if any. */
  goal?: number
}

/** What can be archived. */
export type ArchiveKind = 'chapter' | 'arc' | 'beat' | 'character' | 'element' | 'map'

/**
 * Something archived: taken out of the story (its views, word counts and
 * export) but kept, with what went with it and where everything was, so it
 * can be put back as it was.
 */
export interface ArchivedItem {
  kind: ArchiveKind
  /** The archived thing's id. */
  id: string
  /** When it was archived (ms since 1970). */
  at: number
  /** The draft a chapter, arc or beat was archived from (it's brought back there). */
  draft?: string
  /** It, and what went with it: a chapter's text and beats, an arc's beats. */
  chapters: Chapter[]
  arcs: Arc[]
  beats: Beat[]
  characters: Character[]
  elements: StoryElement[]
  mindMaps: MindMap[]
  texts: Record<string, ChapterText>
  /**
   * The lists it was taken out of, as they were ('chapters', 'timeline',
   * 'arc-beats:<arc id>', 'map:<map id>'…): to put it back in its place.
   */
  places: Record<string, string[]>
  /** Chapters told from this character's point of view. */
  povs: string[]
  /** Beats that lasted until a beat taken: beat id → the beat taken. */
  untils: Record<string, string>
  /** Outline steps that were on beats taken: arc id → step id → beat. */
  steps: Record<string, Record<string, string>>
  /** Its cards on mind maps, with the lines to them, by map. */
  cards: { mapId: string; nodes: MapNode[]; edges: MapEdge[] }[]
}

/** How the whole manuscript looks, in the app and printed (see lib/bookStyle). */
export interface BookStyle {
  /** The typeface, by id (lib/bookStyle FONTS). */
  font: string
  /** Text size in points, as printed. */
  size: number
  /** Line spacing: 1 is single, 2 double. */
  leading: number
  /** Paragraphs indented (as in books), or with space between. */
  paragraphs: 'indent' | 'spaced'
  align: 'left' | 'justify'
  /** Words broken at the ends of lines (when justified). */
  hyphenate: boolean
  /** A chapter's first letter: as the rest, dropped into the first lines, or raised above them. */
  initial: 'none' | 'drop' | 'raised'
  /** A chapter's first line in small capitals. */
  smallCaps: boolean
  /** How chapters are numbered in their headings. */
  numbering: 'chapter-number' | 'chapter-word' | 'word' | 'number' | 'roman'
  headingAlign: 'left' | 'center'
  /** The mark between scenes (lib/bookStyle SCENE_BREAKS). */
  sceneBreak: string
  /** The manuscript shown as pages. */
  pages: boolean
  /** The pages' size (lib/bookStyle PAGE_SIZES). */
  pageSize: string
  /** Each chapter starts on a new page, printed. */
  chapterPage: boolean
  /** How wide the text is when not shown as pages. */
  width: 'narrow' | 'medium' | 'wide'
}

/** A draft's own book: its chapters and their text, its arcs and beats, and story time. */
export interface DraftBook {
  chapters: Chapter[]
  arcs: Arc[]
  beats: Record<string, Beat>
  texts: Record<string, ChapterText>
  timeline: string[]
}

/**
 * A draft of the book: a manuscript of its own, with its own chapters, arcs
 * and beats (characters, places, mind maps and the rest are the story's, in
 * every draft). The open draft's book is the story's own fields; the others
 * keep theirs here.
 */
export interface Draft {
  id: string
  name: string
  /** When it was started (ms since 1970). */
  createdAt: number
  /** Its book, while another draft is open. */
  book?: DraftBook
}

/** Word targets for the whole draft and for each day's writing. */
export interface StoryGoals {
  draft?: number
  daily?: number
}

export interface StoryData {
  title: string
  /** Chapters in reading order; a chapter's number is its position + 1. */
  chapters: Chapter[]
  arcs: Arc[]
  beats: Record<string, Beat>
  characters: Character[]
  /** Places, objects, groups and the like. */
  elements: StoryElement[]
  /** Chapter id -> the chapter's written text. */
  texts: Record<string, ChapterText>
  /**
   * Beats in the order they happen in the story's world, once the writer has
   * arranged them on the timeline; empty until then (story order follows
   * reading order). Beats missing from it slot in by reading order. Among
   * them, 'book:start' and 'book:end' mark where the book begins and ends
   * (at the very beginning and end when missing).
   */
  timeline: string[]
  /** A story can have several mind maps (card and line ids are unique across them). */
  mindMaps: MindMap[]
  goals: StoryGoals
  /**
   * Local date (YYYY-MM-DD) -> words added to the manuscript that day. Words
   * cut are counted apart, in `wordCuts`, so cutting never takes away from it.
   */
  wordLog: Record<string, number>
  /** Local date -> words cut from the manuscript that day. */
  wordCuts: Record<string, number>
  /** The same for the outline (beats, arcs, chapter titles and summaries), kept apart. */
  outlineLog: Record<string, number>
  outlineCuts: Record<string, number>
  /** Writing sprints, oldest first (the last 200). */
  sprints: SprintRecord[]
  /** Things archived, oldest first. */
  archive: ArchivedItem[]
  /** How the manuscript looks. */
  style: BookStyle
  /** The book's drafts, in order (the open one's book is in the fields above). */
  drafts: Draft[]
  /** The open draft. */
  draft: string
}
