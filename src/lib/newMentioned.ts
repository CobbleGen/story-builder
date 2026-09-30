import { useStory } from '../store/storyStore'
import { nextArcColor } from './colors'

/** What typing `@` and a new name can create. */
export type NewMentioned = 'character' | 'place'

/** Creates a character or place from an `@` suggestion; returns its id. */
export function createMentioned(what: NewMentioned, name: string): string {
  const store = useStory.getState()
  if (what === 'character') {
    return store.addCharacter({ name, color: nextArcColor(store.characters.map((c) => c.color)) })
  }
  return store.addElement({ name, kind: 'place', color: nextArcColor(store.elements.map((e) => e.color)) })
}
