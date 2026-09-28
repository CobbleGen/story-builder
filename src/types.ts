export interface Beat {
  id: string
  arcId: string
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
}

export interface Arc {
  id: string
  name: string
  color: string
  description: string
  /** Beats in the order they happen within the arc. */
  beatIds: string[]
}

export interface StoryData {
  title: string
  /** Chapters in reading order; a chapter's number is its position + 1. */
  chapters: Chapter[]
  arcs: Arc[]
  beats: Record<string, Beat>
}
