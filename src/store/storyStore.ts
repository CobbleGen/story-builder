import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ArchiveKind, StoryData } from '../types'
import type { FindQuery } from '../lib/replace'
import * as ops from './storyOps'
import { archiveItem, deleteArchived, restoreArchived, throughArchive, upgradeStory } from './archive'
import * as drafts from './drafts'
import { archivedNamed } from '../lib/archived'
import { buildSampleStory } from './sampleStory'
import { lookupOf, type Lookup, type Mentionable } from '../lib/mentions'
import { STORY_KEY, storyStorage } from './persistence'
import { forget, notify, remember, travel } from './history'
import { reviewing } from '../review/mode'

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
  setBeatUntil: (...args: Tail<Parameters<typeof ops.setBeatUntil>>) => void
  setArcOutline: (...args: Tail<Parameters<typeof ops.setArcOutline>>) => void
  spreadArcOutline: (...args: Tail<Parameters<typeof ops.spreadArcOutline>>) => void
  placeOutlineStep: (...args: Tail<Parameters<typeof ops.placeOutlineStep>>) => void
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
  /** Every match replaced in the chapters' text: one undo step. How many, in how many chapters. */
  replaceText: (query: FindQuery, replacement: string) => { count: number; chapters: number }
  /** Chapters brought in from a manuscript (one undo step); their ids. */
  importChapters: (...args: Tail<Parameters<typeof ops.importChapters>>) => string[]
  /** A change to how the whole manuscript looks. */
  setBookStyle: (...args: Tail<Parameters<typeof ops.setBookStyle>>) => void
  /** A finished sprint, kept with the story (not an undo step). */
  addSprint: (...args: Tail<Parameters<typeof ops.addSprint>>) => void
  /** Archives a chapter, arc, beat, character, element or map, with what goes with it (a chapter's beats, say). */
  archiveThing: (kind: ArchiveKind, id: string) => void
  /** Brings an archived thing back where it was. */
  restoreArchived: (id: string) => void
  /** Deletes an archived thing for good. */
  deleteArchived: (id: string) => void
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
  /** Opens another draft (not a step to undo: like opening another book). */
  switchDraft: (id: string) => void
  /** Starts a draft, a copy of the open one or blank, and opens it; its id. */
  newDraft: (options: { copy: boolean; name?: string }) => string
  renameDraft: (...args: Tail<Parameters<typeof drafts.renameDraft>>) => void
  /** Deletes a draft that isn't open. */
  deleteDraft: (...args: Tail<Parameters<typeof drafts.deleteDraft>>) => void
  moveDraft: (...args: Tail<Parameters<typeof drafts.moveDraft>>) => void
  /** A change someone suggested, accepted (one step to undo). */
  applySuggestion: (change: (data: StoryData) => StoryData) => void
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
  'wordCuts',
  'outlineLog',
  'outlineCuts',
  'sprints',
  'archive',
  'style',
  'drafts',
  'draft',
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
  wordCuts: s.wordCuts,
  outlineLog: s.outlineLog,
  outlineCuts: s.outlineCuts,
  sprints: s.sprints,
  archive: s.archive,
  style: s.style,
  drafts: s.drafts,
  draft: s.draft,
})

/**
 * What's being written but not saved yet (the manuscript editor's text),
 * saved before another draft or story is opened, so it lands where it was
 * written.
 */
const flushers = new Set<() => void>()
export function onBeforeSwitch(flush: () => void): () => void {
  flushers.add(flush)
  return () => flushers.delete(flush)
}
const flushAll = () => {
  for (const flush of flushers) flush()
}
/** Saves what's being written now (the manuscript editor's text), before something is done to the saved text. */
export const saveWriting = flushAll

/**
 * Goes up whenever a whole other story (or another copy of it) is swapped
 * in, so views holding their own copy of its text (the manuscript editor)
 * start again from the new one.
 */
export const useStoryEpoch = create(() => ({ epoch: 0 }))

let refusedAt = 0
/** Reviewing someone's story: changes aren't kept (said once in a while, not on every keystroke). */
function refuse() {
  if (Date.now() - refusedAt < 4000) return
  refusedAt = Date.now()
  notify('You’re reviewing this story, so it can’t be changed here. Leave a comment instead.')
}
/** A change to how a card is shown on the mind map (opened up or not), which a reviewer may make for themselves. */
const viewOnly = (patch: object) => Object.keys(patch).every((k) => k === 'expanded')

let openedFresh = false

export const useStory = create<StoryStore>()(
  persist(
    (set, get) => {
      const data = () => pickData(get())
      /**
       * Saves a change; `name` (the action) puts it in the undo history. Words
       * it adds to the outline (or cuts) go in today's tally, unless it's a
       * whole other story coming in.
       */
      const apply = (next: StoryData, name?: string, target?: unknown, view = false) => {
        const before = data()
        if (next === before || STORY_KEYS.every((k) => next[k] === before[k])) return
        // (Reviewing, only how things are shown changes, in this browser alone, and not as a step to undo.)
        if (reviewing && !view) return refuse()
        if (name && !reviewing) remember(before, name, target)
        // (A whole story coming in, or a draft deleted, isn't writing or cutting.)
        set(pickData(name === 'replaceStory' || name === 'deleteDraft' ? next : ops.logOutline(before, next)))
      }
      /** Another draft open: what was being written saved first, and undo starts afresh (its steps were the other draft's). */
      const reopen = (next: StoryData) => {
        set(pickData(next))
        forget()
        useStoryEpoch.setState((e) => ({ epoch: e.epoch + 1 }))
      }
      /** Undo and redo change the outline's words as much as any other change (undoing takes back what was counted). */
      const step = (direction: 'undo' | 'redo') => {
        const before = data()
        travel(direction, before, (next) => set(pickData(ops.logOutline(before, next, ops.dayKey(), direction === 'undo'))))
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
        deleteChapter: (...a) => apply(throughArchive(data(), (d) => ops.deleteChapter(d, ...a)), 'deleteChapter', a[0]),
        moveChapter: (...a) => apply(ops.moveChapter(data(), ...a), 'moveChapter', a[0]),
        addArc: (...a) => withId(ops.addArc(data(), ...a), 'addArc', a[0]),
        updateArc: (...a) => apply(ops.updateArc(data(), ...a), 'updateArc', a[0]),
        deleteArc: (...a) => apply(throughArchive(data(), (d) => ops.deleteArc(d, ...a)), 'deleteArc', a[0]),
        moveArc: (...a) => apply(ops.moveArc(data(), ...a), 'moveArc', a[0]),
        setBeatUntil: (...a) => apply(ops.setBeatUntil(data(), ...a), 'setBeatUntil', a[0]),
        setArcOutline: (...a) => apply(ops.setArcOutline(data(), ...a), 'setArcOutline', a[1]),
        spreadArcOutline: (...a) => apply(ops.spreadArcOutline(data(), ...a), 'spreadArcOutline', a[0]),
        placeOutlineStep: (...a) => apply(ops.placeOutlineStep(data(), ...a), 'placeOutlineStep', a[0]),
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
        deleteBeat: (...a) => apply(throughArchive(data(), (d) => ops.deleteBeat(d, ...a)), 'deleteBeat', a[0]),
        setArcCharacter: (...a) => apply(ops.setArcCharacter(data(), ...a), 'setArcCharacter', a[0]),
        addCharacter: (...a) => withId(ops.addCharacter(data(), ...a), 'addCharacter', a[0]),
        updateCharacter: (...a) => apply(ops.updateCharacter(data(), ...a), 'updateCharacter', a[0]),
        deleteCharacter: (...a) => apply(throughArchive(data(), (d) => ops.deleteCharacter(d, ...a)), 'deleteCharacter', a[0]),
        moveCharacter: (...a) => apply(ops.moveCharacter(data(), ...a), 'moveCharacter', a[0]),
        addElement: (...a) => withId(ops.addElement(data(), ...a), 'addElement', a[0]),
        updateElement: (...a) => apply(ops.updateElement(data(), ...a), 'updateElement', a[0]),
        deleteElement: (...a) => apply(throughArchive(data(), (d) => ops.deleteElement(d, ...a)), 'deleteElement', a[0]),
        setPortrait: (...a) => apply(ops.setPortrait(data(), ...a), 'setPortrait', a[0]),
        addAttribute: (...a) => withId(ops.addAttribute(data(), ...a), 'addAttribute', a[0]),
        updateAttribute: (...a) => apply(ops.updateAttribute(data(), ...a), 'updateAttribute', a[0]),
        deleteAttribute: (...a) => apply(ops.deleteAttribute(data(), ...a), 'deleteAttribute', a[0]),
        moveAttribute: (...a) => apply(ops.moveAttribute(data(), ...a), 'moveAttribute', a[0]),
        // Not in the undo history: the manuscript editor has its own undo.
        setChapterText: (...a) => apply(ops.setChapterText(data(), ...a)),
        setGoals: (...a) => apply(ops.setGoals(data(), ...a), 'setGoals', a[0]),
        setBookStyle: (...a) => apply(ops.setBookStyle(data(), ...a), 'setBookStyle', Object.keys(a[0]).join()),
        addSprint: (...a) => apply(ops.addSprint(data(), ...a)),
        importChapters: (...a) => {
          const [next, ids] = ops.importChapters(data(), ...a)
          apply(next, 'importChapters', ids.length)
          return ids
        },
        replaceText: (query, replacement) => {
          // Stamped before the history notes it, so undo brings the texts back.
          const [next, done] = ops.replaceInText(data(), query, replacement, Date.now())
          apply(next, 'replaceText', query.text)
          return done
        },
        addMapNode: (...a) => withId(ops.addMapNode(data(), ...a), 'addMapNode', a[0]),
        updateMapNode: (...a) => apply(ops.updateMapNode(data(), ...a), 'updateMapNode', a[0], viewOnly(a[1])),
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
        deleteMindMap: (...a) => apply(throughArchive(data(), (d) => ops.deleteMindMap(d, ...a)), 'deleteMindMap', a[0]),
        archiveThing: (kind, id) => apply(archiveItem(data(), kind, id), 'archive', id),
        restoreArchived: (id) => apply(restoreArchived(data(), id), 'restoreArchived', id),
        deleteArchived: (id) => apply(deleteArchived(data(), id, ops), 'deleteArchived', id),
        switchDraft: (id) => {
          flushAll()
          const next = drafts.switchDraft(data(), id)
          if (next !== data()) reopen(next)
        },
        newDraft: (options) => {
          if (reviewing) {
            refuse()
            return get().draft
          }
          flushAll()
          const [next, id] = drafts.newDraft(data(), options)
          reopen(next)
          return id
        },
        renameDraft: (...a) => apply(drafts.renameDraft(data(), ...a), 'renameDraft', a[0]),
        deleteDraft: (...a) => apply(drafts.deleteDraft(data(), ...a), 'deleteDraft', a[0]),
        moveDraft: (...a) => apply(drafts.moveDraft(data(), ...a), 'moveDraft'),
        applySuggestion: (change) => {
          // What's being written goes in first, so the change is made to the text as it is.
          flushAll()
          apply(change(data()), 'acceptSuggestion')
        },
        replaceStory: (input) => {
          flushAll()
          apply(upgradeStory(input), 'replaceStory')
          useStoryEpoch.setState((e) => ({ epoch: e.epoch + 1 }))
        },
        loadStory: (input) => {
          flushAll()
          set(pickData(upgradeStory(input)))
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
      merge: (persisted, current) => {
        openedFresh = !persisted
        return persisted ? { ...current, ...upgradeStory(persisted) } : current
      },
    },
  ),
)

/** No story was kept in this browser when the page opened (someone's first visit: the example is open). */
export const openedWithoutAStory = () => openedFresh

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
let named: { characters: StoryData['characters']; elements: StoryData['elements']; list: Mentionable[] } | null = null
let looked: { list: Mentionable[]; archive: StoryData['archive']; lookup: Lookup } | null = null

function namedFor(characters: StoryData['characters'], elements: StoryData['elements']) {
  if (!named || named.characters !== characters || named.elements !== elements) {
    named = { characters, elements, list: ops.mentionables({ characters, elements }) }
  }
  return named.list
}

function lookupFor(list: Mentionable[], archive: StoryData['archive']) {
  if (!looked || looked.list !== list || looked.archive !== archive) {
    looked = { list, archive, lookup: lookupOf([...list, ...archivedNamed({ archive })]) }
  }
  return looked.lookup
}

/** Everything that can be @mentioned (characters, then elements). */
export function useMentionables(): Mentionable[] {
  const characters = useStory((s) => s.characters)
  const elements = useStory((s) => s.elements)
  return namedFor(characters, elements)
}

/** Id -> character or element, for rendering mentions (archived ones too: their mentions still read as their names). */
export function useMentionLookup(): Lookup {
  const list = useMentionables()
  const archive = useStory((s) => s.archive)
  return lookupFor(list, archive)
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
