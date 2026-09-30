import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StoryData } from '../types'
import * as ops from './storyOps'
import { buildSampleStory } from './sampleStory'
import { lookupOf } from '../lib/mentions'
import { STORY_KEY, storyStorage } from './persistence'
import { remember, travel } from './history'

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
  setGoals: (...args: Tail<Parameters<typeof ops.setGoals>>) => void
  addMapNode: (...args: Tail<Parameters<typeof ops.addMapNode>>) => string | null
  updateMapNode: (...args: Tail<Parameters<typeof ops.updateMapNode>>) => void
  moveMapNodes: (...args: Tail<Parameters<typeof ops.moveMapNodes>>) => void
  removeMapNodes: (...args: Tail<Parameters<typeof ops.removeMapNodes>>) => void
  addMapEdge: (...args: Tail<Parameters<typeof ops.addMapEdge>>) => string | null
  updateMapEdge: (...args: Tail<Parameters<typeof ops.updateMapEdge>>) => void
  removeMapEdges: (...args: Tail<Parameters<typeof ops.removeMapEdges>>) => void
  addMindMap: (...args: Tail<Parameters<typeof ops.addMindMap>>) => string
  renameMindMap: (...args: Tail<Parameters<typeof ops.renameMindMap>>) => void
  deleteMindMap: (...args: Tail<Parameters<typeof ops.deleteMindMap>>) => void
  /** Swaps in a whole story (import, new story, sample). */
  replaceStory: (data: unknown) => void
  undo: () => void
  redo: () => void
}

export type StoryStore = StoryData & StoryActions

const STORY_KEYS = ['title', 'chapters', 'arcs', 'beats', 'characters', 'texts', 'mindMaps', 'goals', 'wordLog'] as const satisfies readonly (keyof StoryData)[]

/** Just the story's data, without the store's actions (for saving and export). */
export const pickData = (s: StoryData): StoryData => ({
  title: s.title,
  chapters: s.chapters,
  arcs: s.arcs,
  beats: s.beats,
  characters: s.characters,
  texts: s.texts,
  mindMaps: s.mindMaps,
  goals: s.goals,
  wordLog: s.wordLog,
})

export const useStory = create<StoryStore>()(
  persist(
    (set, get) => {
      const data = () => pickData(get())
      /** Saves a change; `name` (the action) puts it in the undo history. */
      const apply = (next: StoryData, name?: string, target?: unknown) => {
        const before = data()
        if (next === before || STORY_KEYS.every((k) => next[k] === before[k])) return
        if (name) remember(before, name, target)
        set(pickData(next))
      }
      const withId = <Id extends string | null>([next, id]: [StoryData, Id], name: string, target?: unknown) => {
        apply(next, name, target)
        return id
      }
      return {
        ...buildSampleStory(),
        setTitle: (title) => apply({ ...data(), title }, 'setTitle'),
        addChapter: (...a) => withId(ops.addChapter(data(), ...a), 'addChapter', a[0]),
        updateChapter: (...a) => apply(ops.updateChapter(data(), ...a), 'updateChapter', a[0]),
        deleteChapter: (...a) => apply(ops.deleteChapter(data(), ...a), 'deleteChapter', a[0]),
        moveChapter: (...a) => apply(ops.moveChapter(data(), ...a), 'moveChapter', a[0]),
        addArc: (...a) => withId(ops.addArc(data(), ...a), 'addArc', a[0]),
        updateArc: (...a) => apply(ops.updateArc(data(), ...a), 'updateArc', a[0]),
        deleteArc: (...a) => apply(ops.deleteArc(data(), ...a), 'deleteArc', a[0]),
        moveArc: (...a) => apply(ops.moveArc(data(), ...a), 'moveArc', a[0]),
        moveArcBeat: (...a) => apply(ops.moveArcBeat(data(), ...a), 'moveArcBeat', a[0]),
        addBeat: (...a) => withId(ops.addBeat(data(), ...a), 'addBeat', a[0]),
        updateBeat: (...a) => apply(ops.updateBeat(data(), ...a), 'updateBeat', a[0]),
        setBeatArc: (...a) => apply(ops.setBeatArc(data(), ...a), 'setBeatArc', a[0]),
        placeBeat: (...a) => apply(ops.placeBeat(data(), ...a), 'placeBeat', a[0]),
        applyChapterLayout: (...a) => apply(ops.applyChapterLayout(data(), ...a), 'applyChapterLayout', a[0]),
        deleteBeat: (...a) => apply(ops.deleteBeat(data(), ...a), 'deleteBeat', a[0]),
        setArcCharacter: (...a) => apply(ops.setArcCharacter(data(), ...a), 'setArcCharacter', a[0]),
        addCharacter: (...a) => withId(ops.addCharacter(data(), ...a), 'addCharacter', a[0]),
        updateCharacter: (...a) => apply(ops.updateCharacter(data(), ...a), 'updateCharacter', a[0]),
        deleteCharacter: (...a) => apply(ops.deleteCharacter(data(), ...a), 'deleteCharacter', a[0]),
        moveCharacter: (...a) => apply(ops.moveCharacter(data(), ...a), 'moveCharacter', a[0]),
        addAttribute: (...a) => withId(ops.addAttribute(data(), ...a), 'addAttribute', a[0]),
        updateAttribute: (...a) => apply(ops.updateAttribute(data(), ...a), 'updateAttribute', a[0]),
        deleteAttribute: (...a) => apply(ops.deleteAttribute(data(), ...a), 'deleteAttribute', a[0]),
        moveAttribute: (...a) => apply(ops.moveAttribute(data(), ...a), 'moveAttribute', a[0]),
        // Not in the undo history: the manuscript editor has its own undo.
        setChapterText: (...a) => apply(ops.setChapterText(data(), ...a)),
        setGoals: (...a) => apply(ops.setGoals(data(), ...a), 'setGoals', a[0]),
        addMapNode: (...a) => withId(ops.addMapNode(data(), ...a), 'addMapNode', a[0]),
        updateMapNode: (...a) => apply(ops.updateMapNode(data(), ...a), 'updateMapNode', a[0]),
        moveMapNodes: (...a) => apply(ops.moveMapNodes(data(), ...a), 'moveMapNodes', a[0]),
        removeMapNodes: (...a) => apply(ops.removeMapNodes(data(), ...a), 'removeMapNodes', a[0]),
        addMapEdge: (...a) => withId(ops.addMapEdge(data(), ...a), 'addMapEdge', a[0]),
        updateMapEdge: (...a) => apply(ops.updateMapEdge(data(), ...a), 'updateMapEdge', a[0]),
        removeMapEdges: (...a) => apply(ops.removeMapEdges(data(), ...a), 'removeMapEdges', a[0]),
        addMindMap: (...a) => withId(ops.addMindMap(data(), ...a), 'addMindMap'),
        renameMindMap: (...a) => apply(ops.renameMindMap(data(), ...a), 'renameMindMap', a[0]),
        deleteMindMap: (...a) => apply(ops.deleteMindMap(data(), ...a), 'deleteMindMap', a[0]),
        replaceStory: (input) => apply(ops.normalizeStory(input), 'replaceStory'),
        undo: () => travel('undo', data(), (next) => set(pickData(next))),
        redo: () => travel('redo', data(), (next) => set(pickData(next))),
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
