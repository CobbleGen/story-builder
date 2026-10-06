import { useShallow } from 'zustand/react/shallow'
import { useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { cleanColor } from './colors'
import type { StoryData } from '../types'

/** The colours the story uses, for the recent ones before any has been picked. */
function storyColors(s: Pick<StoryData, 'arcs' | 'characters' | 'elements' | 'mindMaps'>): string[] {
  const all = [
    ...s.arcs.map((a) => a.color),
    ...s.characters.map((c) => c.color),
    ...s.elements.map((e) => e.color),
    ...s.mindMaps.flatMap((m) => m.nodes.flatMap((n) => ('color' in n ? [n.color] : 'bg' in n && n.bg ? [n.bg] : []))),
  ]
  return [...new Set(all.map(cleanColor).filter((c): c is string => !!c))].slice(0, 12)
}

/** The colours used lately, the latest first. */
export function useRecentColors(): string[] {
  const recent = useUi((s) => s.recentColors)
  const inStory = useStory(useShallow((s) => (recent.length ? [] : storyColors(s))))
  return recent.length ? recent : inStory
}
