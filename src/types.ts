export interface Beat {
  id: string
  arcId: string
  /** Text fields may contain character mentions, stored as `@{<characterId>}`. */
  title: string
  description: string
  /** The chapter this beat is placed in, or null while it only lives on its arc. */
  chapterId: string | null
  /** Ticked off in the manuscript: the beat has been written. */
  done: boolean
}

export interface Chapter {
  id: string
  title: string
  summary: string
  /** Beats in the order they happen within the chapter. */
  beatIds: string[]
  /** The character whose point of view the chapter is told from. */
  povCharacterId: string | null
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
export type MapEntityKind = 'arc' | 'chapter' | 'character' | 'beat'
export type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple' | 'orange'
export type TextSize = 'sm' | 'md' | 'lg'

export type MapNode =
  | { id: string; kind: MapEntityKind; refId: string; x: number; y: number }
  | { id: string; kind: 'note'; x: number; y: number; width: number; height: number; text: string; color: NoteColor }
  | { id: string; kind: 'text'; x: number; y: number; width: number; text: string; size: TextSize }

/** A line between two things on the mind map. */
export interface MapEdge {
  id: string
  source: string
  target: string
  label: string
  arrow: boolean
}

export interface MindMap {
  nodes: MapNode[]
  edges: MapEdge[]
}

export interface StoryData {
  title: string
  /** Chapters in reading order; a chapter's number is its position + 1. */
  chapters: Chapter[]
  arcs: Arc[]
  beats: Record<string, Beat>
  characters: Character[]
  /** Chapter id -> the chapter's written text. */
  texts: Record<string, ChapterText>
  mindMap: MindMap
}
