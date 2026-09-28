export interface Beat {
  id: string
  arcId: string
  /** Text fields may contain character mentions, stored as `@{<characterId>}`. */
  title: string
  description: string
  /** The chapter this beat is placed in, or null while it only lives on its arc. */
  chapterId: string | null
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

export interface StoryData {
  title: string
  /** Chapters in reading order; a chapter's number is its position + 1. */
  chapters: Chapter[]
  arcs: Arc[]
  beats: Record<string, Beat>
  characters: Character[]
}
