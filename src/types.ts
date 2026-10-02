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
}

/** How far along a chapter is. */
export type ChapterStatus = 'outline' | 'draft' | 'revised' | 'done'

export interface Chapter {
  id: string
  title: string
  summary: string
  /** Beats in the order they happen within the chapter. */
  beatIds: string[]
  /** The character whose point of view the chapter is told from. */
  povCharacterId: string | null
  status: ChapterStatus
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
export type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple' | 'orange' | 'white'
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
   * reading order). Beats missing from it slot in by reading order.
   */
  timeline: string[]
  /** A story can have several mind maps (card and line ids are unique across them). */
  mindMaps: MindMap[]
  goals: StoryGoals
  /** Local date (YYYY-MM-DD) -> words added that day, less words cut. */
  wordLog: Record<string, number>
}
