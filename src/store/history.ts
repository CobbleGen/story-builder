import { create } from 'zustand'
import type { ElementKind, StoryData } from '../types'
import { ELEMENT_KIND_NAMES } from '../lib/elements'

// Undo and redo for the story (the board, arcs, characters, the mind map…).
// Each change keeps a copy of the story from just before it; the copies share
// everything that didn't change, so they cost little. Typing in one field is
// one step. The manuscript's own typing has the editor's undo instead, so a
// chapter's text written since a copy was taken is never rolled back.

export interface HistoryEntry {
  data: StoryData
  /** Which change this was, for grouping typing into one step. */
  key: string
  /** Shown as "Undo delete beat". */
  label: string
  /** When the copy was taken. */
  takenAt: number
  /** When the step last grew (typing keeps adding to it). */
  lastAt: number
}

interface HistoryState {
  past: HistoryEntry[]
  future: HistoryEntry[]
  /** A short note after undoing or redoing, like "Undid delete beat". */
  notice: { text: string; id: number } | null
}

export const useHistory = create<HistoryState>(() => ({ past: [], future: [], notice: null }))

const LIMIT = 100
/** Changes to the same thing this close together are one step (typing a title, say). */
const GROUP_MS = 1500

/** Actions whose repeats on the same item within a moment join into one step. */
const GROUPED = new Set([
  'setTitle',
  'updateChapter',
  'updateArc',
  'updateBeat',
  'updateCharacter',
  'updateElement',
  'updateAttribute',
  'updateMapNode',
  'updateMapEdge',
  'setGoals',
  'renameMindMap',
])

const LABELS: Record<string, string> = {
  setTitle: 'rename story',
  addChapter: 'add chapter',
  updateChapter: 'edit chapter',
  deleteChapter: 'delete chapter',
  moveChapter: 'move chapter',
  addArc: 'add arc',
  updateArc: 'edit arc',
  deleteArc: 'delete arc',
  moveArc: 'move arc',
  moveArcBeat: 'reorder beats',
  addBeat: 'add beat',
  updateBeat: 'edit beat',
  setBeatArc: 'change beat’s arc',
  placeBeat: 'move beat',
  applyChapterLayout: 'move beat',
  moveInStory: 'move beat in time',
  moveInReading: 'move beat',
  resetTimeline: 'reset the timeline',
  deleteBeat: 'delete beat',
  setArcCharacter: 'change arc’s cast',
  addCharacter: 'add character',
  updateCharacter: 'edit character',
  deleteCharacter: 'delete character',
  moveCharacter: 'move character',
  // Elements are named by their kind ("delete place"); see labelOf.
  addElement: 'add',
  updateElement: 'edit',
  deleteElement: 'delete',
  // "change portrait", or "change picture" for an element; see labelOf.
  setPortrait: 'change',
  addAttribute: 'add attribute',
  updateAttribute: 'edit attribute',
  deleteAttribute: 'delete attribute',
  moveAttribute: 'move attribute',
  setGoals: 'change goals',
  addMapNode: 'add to map',
  updateMapNode: 'edit map card',
  moveMapNodes: 'move map cards',
  removeMapNodes: 'remove from map',
  dropMapNodes: 'move map cards',
  setContainerLayout: 'change container layout',
  resizeContainer: 'resize container',
  pasteMapItems: 'paste',
  addMapEdge: 'draw line',
  updateMapEdge: 'edit line',
  removeMapEdges: 'delete line',
  addMindMap: 'new map',
  renameMindMap: 'rename map',
  deleteMindMap: 'delete map',
  replaceStory: 'replace story',
}

export const labelFor = (name: string) => LABELS[name] ?? 'change'

/** The label for a change, naming the kind of element for element changes. */
function labelOf(name: string, before: StoryData, target: unknown): string {
  if (name === 'addElement' || name === 'updateElement' || name === 'deleteElement') {
    const kind: ElementKind | undefined =
      typeof target === 'string'
        ? before.elements.find((e) => e.id === target)?.kind
        : (target as { kind?: ElementKind } | undefined)?.kind
    return `${LABELS[name]} ${kind ? ELEMENT_KIND_NAMES[kind].noun : 'item'}`
  }
  if (name === 'setPortrait') return `${LABELS[name]} ${String(target).startsWith('elm_') ? 'picture' : 'portrait'}`
  return labelFor(name)
}

/** Notes the story as it was before a change. */
export function remember(before: StoryData, name: string, target?: unknown) {
  const key = `${name}:${typeof target === 'string' ? target : ''}`
  const now = Date.now()
  const { past } = useHistory.getState()
  const last = past[past.length - 1]
  if (last && last.key === key && GROUPED.has(name) && now - last.lastAt < GROUP_MS) {
    useHistory.setState({ past: [...past.slice(0, -1), { ...last, lastAt: now }], future: [] })
    return
  }
  const entry: HistoryEntry = { data: before, key, label: labelOf(name, before, target), takenAt: now, lastAt: now }
  useHistory.setState({ past: [...past.slice(-(LIMIT - 1)), entry], future: [] })
}

/**
 * The story as copied, but with chapter texts written since the copy was
 * taken kept as they are now, and the day-by-day word log left alone.
 */
export function restore(copy: StoryData, now: StoryData, takenAt: number): StoryData {
  const texts: StoryData['texts'] = {}
  for (const chapter of copy.chapters) {
    const current = now.texts[chapter.id]
    const then = copy.texts[chapter.id]
    const text = current && (!then || current.updatedAt > takenAt) ? current : then
    if (text) texts[chapter.id] = text
  }
  return { ...copy, texts, wordLog: now.wordLog }
}

let noticeId = 0

/** Steps back (or forward) through the history, handing the story to `apply`. */
export function travel(direction: 'undo' | 'redo', current: StoryData, apply: (data: StoryData) => void) {
  const { past, future } = useHistory.getState()
  const from = direction === 'undo' ? past : future
  const entry = from[from.length - 1]
  if (!entry) return
  const now = Date.now()
  const back: HistoryEntry = { ...entry, data: current, takenAt: now, lastAt: 0 }
  const rest = from.slice(0, -1)
  useHistory.setState(
    direction === 'undo'
      ? { past: rest, future: [...future, back], notice: { text: `Undid ${entry.label}`, id: ++noticeId } }
      : { future: rest, past: [...past, back], notice: { text: `Redid ${entry.label}`, id: ++noticeId } },
  )
  apply(restore(entry.data, current, entry.takenAt))
}
