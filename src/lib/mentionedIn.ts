import type { Arc, Beat, Chapter, Character, StoryData, StoryElement } from '../types'
import { mentions } from './mentions'
import { countMentions } from './richText'

/** Everywhere a character or element is mentioned. */
export interface MentionPlaces {
  /** In story order: beats in chapters by chapter, then the rest by arc. */
  beats: Beat[]
  /** Chapters whose written text names it, and how many times. */
  texts: { chapter: Chapter; count: number }[]
  chapters: Chapter[]
  arcs: Arc[]
  characters: Character[]
  elements: StoryElement[]
}

type Story = Pick<StoryData, 'chapters' | 'arcs' | 'beats' | 'characters' | 'elements' | 'texts'>

export function mentionPlaces(data: Story, id: string): MentionPlaces {
  const { chapters, arcs, beats, texts } = data
  // Its own description doesn't count.
  const describes = (c: Character | StoryElement) =>
    c.id !== id && (mentions(c.description, id) || c.attributes.some((a) => mentions(a.value, id)))
  return {
    beats: [...chapters.flatMap((c) => c.beatIds), ...arcs.flatMap((a) => a.beatIds.filter((b) => !beats[b]?.chapterId))]
      .map((b) => beats[b])
      .filter((b): b is Beat => !!b && (mentions(b.title, id) || mentions(b.description, id))),
    texts: chapters
      .map((chapter) => ({ chapter, count: texts[chapter.id] ? countMentions(texts[chapter.id].doc, id) : 0 }))
      .filter((t) => t.count > 0),
    chapters: chapters.filter((c) => mentions(c.title, id) || mentions(c.summary, id)),
    arcs: arcs.filter((a) => mentions(a.name, id) || mentions(a.description, id)),
    characters: data.characters.filter(describes),
    elements: data.elements.filter(describes),
  }
}

/** How many places (beats, chapters, arcs…) something is mentioned in. */
export const placeCount = (p: MentionPlaces) =>
  p.beats.length + p.texts.length + p.chapters.length + p.arcs.length + p.characters.length + p.elements.length
