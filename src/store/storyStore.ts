import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StoryData } from '../types'
import * as ops from './storyOps'
import { buildSampleStory } from './sampleStory'
import { lookupOf } from '../lib/mentions'
import { STORY_KEY, storyStorage } from './persistence'

type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never

interface StoryActions {
  setTitle: (title: string) => void
  addChapter: (...args: Tail<Parameters<typeof ops.addChapter>>) => string
  updateChapter: (...args: Tail<Parameters<typeof ops.updateChapter>>) => void
  deleteChapter: (...args: Tail<Parameters<typeof ops.deleteChapter>>) => void
  moveChapter: (...args: Tail<Parameters<typeof ops.moveChapter>>) => void
  addArc: (...args: Tail<Parameters<typeof ops.addArc>>) => string
  updateArc: (...args: Tail<Parameters<typeof ops.updateArc>>) => void
  deleteArc: (...args: Tail<Parameters<typeof ops.deleteArc>>) => void
  moveArc: (...args: Tail<Parameters<typeof ops.moveArc>>) => void
  moveArcBeat: (...args: Tail<Parameters<typeof ops.moveArcBeat>>) => void
  addBeat: (...args: Tail<Parameters<typeof ops.addBeat>>) => string
  updateBeat: (...args: Tail<Parameters<typeof ops.updateBeat>>) => void
  setBeatArc: (...args: Tail<Parameters<typeof ops.setBeatArc>>) => void
  placeBeat: (...args: Tail<Parameters<typeof ops.placeBeat>>) => void
  applyChapterLayout: (...args: Tail<Parameters<typeof ops.applyChapterLayout>>) => void
  deleteBeat: (...args: Tail<Parameters<typeof ops.deleteBeat>>) => void
  setArcCharacter: (...args: Tail<Parameters<typeof ops.setArcCharacter>>) => void
  addCharacter: (...args: Tail<Parameters<typeof ops.addCharacter>>) => string
  updateCharacter: (...args: Tail<Parameters<typeof ops.updateCharacter>>) => void
  deleteCharacter: (...args: Tail<Parameters<typeof ops.deleteCharacter>>) => void
  moveCharacter: (...args: Tail<Parameters<typeof ops.moveCharacter>>) => void
  addAttribute: (...args: Tail<Parameters<typeof ops.addAttribute>>) => string
  updateAttribute: (...args: Tail<Parameters<typeof ops.updateAttribute>>) => void
  deleteAttribute: (...args: Tail<Parameters<typeof ops.deleteAttribute>>) => void
  moveAttribute: (...args: Tail<Parameters<typeof ops.moveAttribute>>) => void
  setChapterText: (...args: Tail<Parameters<typeof ops.setChapterText>>) => void
  addMapNode: (...args: Tail<Parameters<typeof ops.addMapNode>>) => string | null
  updateMapNode: (...args: Tail<Parameters<typeof ops.updateMapNode>>) => void
  moveMapNodes: (...args: Tail<Parameters<typeof ops.moveMapNodes>>) => void
  removeMapNodes: (...args: Tail<Parameters<typeof ops.removeMapNodes>>) => void
  addMapEdge: (...args: Tail<Parameters<typeof ops.addMapEdge>>) => string | null
  updateMapEdge: (...args: Tail<Parameters<typeof ops.updateMapEdge>>) => void
  removeMapEdges: (...args: Tail<Parameters<typeof ops.removeMapEdges>>) => void
  /** Swaps in a whole story (import, new story, sample). */
  replaceStory: (data: unknown) => void
}

export type StoryStore = StoryData & StoryActions

/** Just the story's data, without the store's actions (for saving and export). */
export const pickData = (s: StoryData): StoryData => ({
  title: s.title,
  chapters: s.chapters,
  arcs: s.arcs,
  beats: s.beats,
  characters: s.characters,
  texts: s.texts,
  mindMap: s.mindMap,
})

export const useStory = create<StoryStore>()(
  persist(
    (set, get) => {
      const apply = (next: StoryData) => set(pickData(next))
      const data = () => pickData(get())
      const withId = <Id extends string | null>([next, id]: [StoryData, Id]) => {
        apply(next)
        return id
      }
      return {
        ...buildSampleStory(),
        setTitle: (title) => set({ title }),
        addChapter: (...a) => withId(ops.addChapter(data(), ...a)),
        updateChapter: (...a) => apply(ops.updateChapter(data(), ...a)),
        deleteChapter: (...a) => apply(ops.deleteChapter(data(), ...a)),
        moveChapter: (...a) => apply(ops.moveChapter(data(), ...a)),
        addArc: (...a) => withId(ops.addArc(data(), ...a)),
        updateArc: (...a) => apply(ops.updateArc(data(), ...a)),
        deleteArc: (...a) => apply(ops.deleteArc(data(), ...a)),
        moveArc: (...a) => apply(ops.moveArc(data(), ...a)),
        moveArcBeat: (...a) => apply(ops.moveArcBeat(data(), ...a)),
        addBeat: (...a) => withId(ops.addBeat(data(), ...a)),
        updateBeat: (...a) => apply(ops.updateBeat(data(), ...a)),
        setBeatArc: (...a) => apply(ops.setBeatArc(data(), ...a)),
        placeBeat: (...a) => apply(ops.placeBeat(data(), ...a)),
        applyChapterLayout: (...a) => apply(ops.applyChapterLayout(data(), ...a)),
        deleteBeat: (...a) => apply(ops.deleteBeat(data(), ...a)),
        setArcCharacter: (...a) => apply(ops.setArcCharacter(data(), ...a)),
        addCharacter: (...a) => withId(ops.addCharacter(data(), ...a)),
        updateCharacter: (...a) => apply(ops.updateCharacter(data(), ...a)),
        deleteCharacter: (...a) => apply(ops.deleteCharacter(data(), ...a)),
        moveCharacter: (...a) => apply(ops.moveCharacter(data(), ...a)),
        addAttribute: (...a) => withId(ops.addAttribute(data(), ...a)),
        updateAttribute: (...a) => apply(ops.updateAttribute(data(), ...a)),
        deleteAttribute: (...a) => apply(ops.deleteAttribute(data(), ...a)),
        moveAttribute: (...a) => apply(ops.moveAttribute(data(), ...a)),
        setChapterText: (...a) => apply(ops.setChapterText(data(), ...a)),
        addMapNode: (...a) => withId(ops.addMapNode(data(), ...a)),
        updateMapNode: (...a) => apply(ops.updateMapNode(data(), ...a)),
        moveMapNodes: (...a) => apply(ops.moveMapNodes(data(), ...a)),
        removeMapNodes: (...a) => apply(ops.removeMapNodes(data(), ...a)),
        addMapEdge: (...a) => withId(ops.addMapEdge(data(), ...a)),
        updateMapEdge: (...a) => apply(ops.updateMapEdge(data(), ...a)),
        removeMapEdges: (...a) => apply(ops.removeMapEdges(data(), ...a)),
        replaceStory: (input) => apply(ops.normalizeStory(input)),
      }
    },
    {
      name: STORY_KEY,
      version: 3,
      storage: storyStorage<StoryData>(),
      partialize: (s) => pickData(s),
      // Older saves are upgraded by normalizeStory in merge below.
      migrate: (persisted) => persisted as StoryStore,
      // Saved data is repaired on load so a bad save can't break the board.
      merge: (persisted, current) =>
        persisted ? { ...current, ...ops.normalizeStory(persisted) } : current,
    },
  ),
)

/** Chapter id -> chapter number (1-based). */
export function useChapterNumbers(): Record<string, number> {
  const chapters = useStory((s) => s.chapters)
  return chapterNumbers(chapters)
}

const numberCache = new WeakMap<object, Record<string, number>>()

export function chapterNumbers(chapters: StoryData['chapters']): Record<string, number> {
  let map = numberCache.get(chapters)
  if (!map) {
    map = {}
    chapters.forEach((c, i) => (map![c.id] = i + 1))
    numberCache.set(chapters, map)
  }
  return map
}

const lookupCache = new WeakMap<object, ReturnType<typeof lookupOf>>()

/** Character id -> character, for rendering mentions. */
export function useCharacterLookup() {
  const characters = useStory((s) => s.characters)
  let map = lookupCache.get(characters)
  if (!map) {
    map = lookupOf(characters)
    lookupCache.set(characters, map)
  }
  return map
}

/** Whether the saved story has been loaded (it loads asynchronously). */
export function useStoryLoaded(): boolean {
  return useSyncExternalStore(
    (onChange) => useStory.persist.onFinishHydration(onChange),
    () => useStory.persist.hasHydrated(),
  )
}

// After the first edit, ask the browser to keep this site's storage even when
// space runs low, so the saved story isn't cleared automatically.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  useStory.persist.onFinishHydration(() => {
    const stop = useStory.subscribe(() => {
      stop()
      navigator.storage.persist().catch(() => {})
    })
  })
}
