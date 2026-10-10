import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StoryData } from '../types'
import * as ops from './storyOps'
import { buildSampleStory } from './sampleStory'
import { lookupOf, type Lookup, type Mentionable } from '../lib/mentions'
import { STORY_KEY, storyStorage } from './persistence'
import { forget, remember, travel } from './history'

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
  moveInStory: (...args: Tail<Parameters<typeof ops.moveInStory>>) => void
  moveInReading: (...args: Tail<Parameters<typeof ops.moveInReading>>) => void
  addBeatInStory: (...args: Tail<Parameters<typeof ops.addBeatInStory>>) => string
  addBeatInReading: (...args: Tail<Parameters<typeof ops.addBeatInReading>>) => string
  resetTimeline: () => void
  moveBookMarker: (...args: Tail<Parameters<typeof ops.moveBookMarker>>) => void
  matchStoryOrder: () => void
  moveChapterEdge: (...args: Tail<Parameters<typeof ops.moveChapterEdge>>) => void
  insertChapter: (...args: Tail<Parameters<typeof ops.insertChapter>>) => string
  deleteBeat: (...args: Tail<Parameters<typeof ops.deleteBeat>>) => void
  setArcCharacter: (...args: Tail<Parameters<typeof ops.setArcCharacter>>) => void
  addCharacter: (...args: Tail<Parameters<typeof ops.addCharacter>>) => string
  updateCharacter: (...args: Tail<Parameters<typeof ops.updateCharacter>>) => void
  deleteCharacter: (...args: Tail<Parameters<typeof ops.deleteCharacter>>) => void
  moveCharacter: (...args: Tail<Parameters<typeof ops.moveCharacter>>) => void
  addElement: (...args: Tail<Parameters<typeof ops.addElement>>) => string
  updateElement: (...args: Tail<Parameters<typeof ops.updateElement>>) => void
  deleteElement: (...args: Tail<Parameters<typeof ops.deleteElement>>) => void
  setPortrait: (...args: Tail<Parameters<typeof ops.setPortrait>>) => void
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
  pasteMapItems: (...args: Tail<Parameters<typeof ops.pasteMapItems>>) => string[]
  dropMapNodes: (...args: Tail<Parameters<typeof ops.dropMapNodes>>) => void
  setContainerLayout: (...args: Tail<Parameters<typeof ops.setContainerLayout>>) => void
  resizeContainer: (...args: Tail<Parameters<typeof ops.resizeContainer>>) => void
  addMapEdge: (...args: Tail<Parameters<typeof ops.addMapEdge>>) => string | null
  updateMapEdge: (...args: Tail<Parameters<typeof ops.updateMapEdge>>) => void
  removeMapEdges: (...args: Tail<Parameters<typeof ops.removeMapEdges>>) => void
  addMindMap: (...args: Tail<Parameters<typeof ops.addMindMap>>) => string
  renameMindMap: (...args: Tail<Parameters<typeof ops.renameMindMap>>) => void
  deleteMindMap: (...args: Tail<Parameters<typeof ops.deleteMindMap>>) => void
  /** Swaps in a whole story (import, new story, sample). */
  replaceStory: (data: unknown) => void
  /** Swaps in a story from the writer's account: not a change made here, and not one to undo. */
  loadStory: (data: StoryData) => void
  undo: () => void
  redo: () => void
}

export type StoryStore = StoryData & StoryActions

export const STORY_KEYS = [
  'title',
  'chapters',
  'arcs',
  'beats',
  'characters',
  'elements',
  'texts',
  'timeline',
  'mindMaps',
  'goals',
  'wordLog',
  'outlineLog',
] as const satisfies readonly (keyof StoryData)[]

/** Just the story's data, without the store's actions (for saving and export). */
export const pickData = (s: StoryData): StoryData => ({
  title: s.title,
  chapters: s.chapters,
  arcs: s.arcs,
  beats: s.beats,
  characters: s.characters,
  elements: s.elements,
  texts: s.texts,
  timeline: s.timeline,
  mindMaps: s.mindMaps,
  goals: s.goals,
  wordLog: s.wordLog,
  outlineLog: s.outlineLog,
})

/**
 * Goes up whenever a whole other story (or another copy of it) is swapped
 * in, so views holding their own copy of its text (the manuscript editor)
 * start again from the new one.
 */
export const useStoryEpoch = create(() => ({ epoch: 0 }))

export const useStory = create<StoryStore>()(
  persist(
    (set, get) => {
      const data = () => pickData(get())
      /**
       * Saves a change; `name` (the action) puts it in the undo history. Words
       * it adds to the outline (or cuts) go in today's tally, unless it's a
       * whole other story coming in.
       */
      const apply = (next: StoryData, name?: string, target?: unknown) => {
        const before = data()
        if (next === before || STORY_KEYS.every((k) => next[k] === before[k])) return
        if (name) remember(before, name, target)
        set(pickData(name === 'replaceStory' ? next : ops.logOutline(before, next)))
      }
      /** Undo and redo change the outline's words as much as any other change. */
      const step = (direction: 'undo' | 'redo') => {
        const before = data()
        travel(direction, before, (next) => set(pickData(ops.logOutline(before, next))))
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
        moveInStory: (...a) => apply(ops.moveInStory(data(), ...a), a[2] ? 'moveToArc' : 'moveInStory', a[0]),
        moveInReading: (...a) => apply(ops.moveInReading(data(), ...a), a[2] ? 'moveToArc' : 'moveInReading', a[0]),
        addBeatInStory: (...a) => withId(ops.addBeatInStory(data(), ...a), 'addBeat', a[0]),
        addBeatInReading: (...a) => withId(ops.addBeatInReading(data(), ...a), 'addBeat', a[0]),
        resetTimeline: () => apply(ops.resetTimeline(data()), 'resetTimeline'),
        moveBookMarker: (...a) => apply(ops.moveBookMarker(data(), ...a), 'moveBookMarker', a[0]),
        matchStoryOrder: () => apply(ops.matchStoryOrder(data()), 'matchStoryOrder'),
        moveChapterEdge: (...a) => apply(ops.moveChapterEdge(data(), ...a), 'moveChapterEdge', a[0]),
        insertChapter: (...a) => withId(ops.insertChapter(data(), ...a), 'insertChapter', a[1] === undefined ? 'empty' : 'split'),
        deleteBeat: (...a) => apply(ops.deleteBeat(data(), ...a), 'deleteBeat', a[0]),
        setArcCharacter: (...a) => apply(ops.setArcCharacter(data(), ...a), 'setArcCharacter', a[0]),
        addCharacter: (...a) => withId(ops.addCharacter(data(), ...a), 'addCharacter', a[0]),
        updateCharacter: (...a) => apply(ops.updateCharacter(data(), ...a), 'updateCharacter', a[0]),
        deleteCharacter: (...a) => apply(ops.deleteCharacter(data(), ...a), 'deleteCharacter', a[0]),
        moveCharacter: (...a) => apply(ops.moveCharacter(data(), ...a), 'moveCharacter', a[0]),
        addElement: (...a) => withId(ops.addElement(data(), ...a), 'addElement', a[0]),
        updateElement: (...a) => apply(ops.updateElement(data(), ...a), 'updateElement', a[0]),
        deleteElement: (...a) => apply(ops.deleteElement(data(), ...a), 'deleteElement', a[0]),
        setPortrait: (...a) => apply(ops.setPortrait(data(), ...a), 'setPortrait', a[0]),
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
        dropMapNodes: (...a) => apply(ops.dropMapNodes(data(), ...a), 'dropMapNodes'),
        setContainerLayout: (...a) => apply(ops.setContainerLayout(data(), ...a), 'setContainerLayout', a[0]),
        resizeContainer: (...a) => apply(ops.resizeContainer(data(), ...a), 'resizeContainer', a[0]),
        pasteMapItems: (...a) => {
          const [next, ids] = ops.pasteMapItems(data(), ...a)
          apply(next, 'pasteMapItems')
          return ids
        },
        addMapEdge: (...a) => withId(ops.addMapEdge(data(), ...a), 'addMapEdge', a[0]),
        updateMapEdge: (...a) => apply(ops.updateMapEdge(data(), ...a), 'updateMapEdge', a[0]),
        removeMapEdges: (...a) => apply(ops.removeMapEdges(data(), ...a), 'removeMapEdges', a[0]),
        addMindMap: (...a) => withId(ops.addMindMap(data(), ...a), 'addMindMap'),
        renameMindMap: (...a) => apply(ops.renameMindMap(data(), ...a), 'renameMindMap', a[0]),
        deleteMindMap: (...a) => apply(ops.deleteMindMap(data(), ...a), 'deleteMindMap', a[0]),
        replaceStory: (input) => {
          apply(ops.normalizeStory(input), 'replaceStory')
          useStoryEpoch.setState((e) => ({ epoch: e.epoch + 1 }))
        },
        loadStory: (input) => {
          set(pickData(ops.normalizeStory(input)))
          forget()
          useStoryEpoch.setState((e) => ({ epoch: e.epoch + 1 }))
        },
        undo: () => step('undo'),
        redo: () => step('redo'),
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

// The last lists worked out, so every text field shares one copy.
let named: { characters: StoryData['characters']; elements: StoryData['elements']; list: Mentionable[]; lookup: Lookup } | null =
  null

function namedFor(characters: StoryData['characters'], elements: StoryData['elements']) {
  if (!named || named.characters !== characters || named.elements !== elements) {
    const list = ops.mentionables({ characters, elements })
    named = { characters, elements, list, lookup: lookupOf(list) }
  }
  return named
}

/** Everything that can be @mentioned (characters, then elements). */
export function useMentionables(): Mentionable[] {
  const characters = useStory((s) => s.characters)
  const elements = useStory((s) => s.elements)
  return namedFor(characters, elements).list
}

/** Id -> character or element, for rendering mentions. */
export function useMentionLookup(): Lookup {
  const characters = useStory((s) => s.characters)
  const elements = useStory((s) => s.elements)
  return namedFor(characters, elements).lookup
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
