import { useMemo } from 'react'
import { useStory } from '../store/storyStore'
import { mentionPlaces, type MentionPlaces } from './mentionedIn'

/** Everywhere a character or element is mentioned, worked out from the live story. */
export function useMentionPlaces(id: string): MentionPlaces {
  const chapters = useStory((s) => s.chapters)
  const arcs = useStory((s) => s.arcs)
  const beats = useStory((s) => s.beats)
  const characters = useStory((s) => s.characters)
  const elements = useStory((s) => s.elements)
  const texts = useStory((s) => s.texts)
  return useMemo(
    () => mentionPlaces({ chapters, arcs, beats, characters, elements, texts }, id),
    [chapters, arcs, beats, characters, elements, texts, id],
  )
}
