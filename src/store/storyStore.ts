import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { StoryData } from '../types'
import * as ops from './storyOps'
import { buildSampleStory } from './sampleStory'

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
  /** Swaps in a whole story (import, new story, sample). */
  replaceStory: (data: unknown) => void
}

export type StoryStore = StoryData & StoryActions

const pickData = (s: StoryData): StoryData => ({
  title: s.title,
  chapters: s.chapters,
  arcs: s.arcs,
  beats: s.beats,
})

export const useStory = create<StoryStore>()(
  persist(
    (set, get) => {
      const apply = (next: StoryData) => set(pickData(next))
      const data = () => pickData(get())
      const withId = ([next, id]: [StoryData, string]) => {
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
        replaceStory: (input) => apply(ops.normalizeStory(input)),
      }
    },
    {
      name: 'story-builder:story',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => pickData(s),
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
