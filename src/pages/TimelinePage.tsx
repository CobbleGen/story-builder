import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { Book, BookOpen, Check, FastForward, GripVertical, History, ListRestart, Plus, Rewind, X } from 'lucide-react'
import type { Arc, Beat } from '../types'
import { chapterNumbers, useMentionLookup, useStory } from '../store/storyStore'
import { useUi, type TimelineMode } from '../store/uiStore'
import {
  beatsInBook,
  isMoment,
  matchStoryOrder,
  readingSections,
  resetTimeline,
  storyOrder,
  storyStops,
  type BookMarker,
  type TimelineSpot,
} from '../store/storyOps'
import { labelSpans, timeJumps, type Jump } from '../lib/timeline'
import { plainText } from '../lib/mentions'
import { nextArcColor } from '../lib/colors'
import { askConfirm } from '../lib/confirm'
import { MentionText } from '../components/MentionText'
import { MentionTextarea } from '../components/MentionTextarea'
import { ChapterTag } from '../components/ChapterTag'

const MODES: { mode: TimelineMode; label: string }[] = [
  { mode: 'story', label: 'Story order' },
  { mode: 'reading', label: 'Reading order' },
]

/** A place on the timeline: in story time, or in reading order in a chapter (null: in none). */
type Where = TimelineSpot & { chapterId?: string | null }
type GapWhere = { gap: number; chapterId?: string | null }
type ColumnWhere = { column: number; chapterId?: string | null }

/**
 * The timeline, left to right: gaps (to add a beat in, or drop one in at a
 * moment of its own) between columns of beats happening at once, and in
 * story order the lines where the book begins and ends. A wide gap stands
 * for an empty chapter, or a book with nothing in it yet; a draft is where a
 * new beat is being written.
 */
type Slot =
  | { kind: 'gap'; key: string; where: GapWhere; wide?: boolean; title: string }
  | { kind: 'column'; key: string; where: ColumnWhere; beats: string[] }
  | { kind: 'marker'; key: string; marker: BookMarker; drag: MarkerDrag }
  | { kind: 'draft'; key: string }

/** A span of slots along the top: a chapter, or beats with the same "when". */
interface Heading {
  from: number
  to: number
  label: string
  /** In reading order: its chapter (null for the beats in none), and how many columns it has. */
  chapterId?: string | null
  columns?: number
}

/** A new beat being written: in a gap, or in a column's empty place (at the same time as its beats). */
interface Draft {
  mode: TimelineMode
  arcId: string
  where: Where
}

/** The one + shown: by the pointer, in an arc's lane, in the slot it's in. */
interface AddAt {
  arcId: string
  slot: number
}

/**
 * What's dragged: a beat (and, if it's picked out, the others picked out with
 * it), the line where the book begins or ends, or the edge between two
 * chapters.
 */
type DragData = BeatsDrag | MarkerDrag | EdgeDrag
type BeatsDrag = { kind: 'beats'; arcId: string; moving: string[]; arcs: string[] }
/** The book's beginning or end: it can go into gaps `min` to `max` (never past the other one). */
type MarkerDrag = { kind: 'marker'; marker: BookMarker; min: number; max: number }
/** The edge between a chapter (of `columns` columns) and the next: into a gap of either. */
type EdgeDrag = { kind: 'edge'; chapterId: string; nextId: string; columns: number }

interface DropData {
  kind: 'gap' | 'column'
  where: Where
  beats: string[]
  /** The arc of each of `beats`. */
  arcs: string[]
}

const sameGap = (a: Where, b: Where) => 'gap' in a && 'gap' in b && a.gap === b.gap && a.chapterId === b.chapterId
const NO_SELECTION = new Set<string>()

/** Whether what's dragged can go there at all: a book line or chapter edge only into the gaps it can move to. */
function fits(drop: DropData, drag: DragData | undefined): boolean {
  if (!drag || drag.kind === 'beats') return true
  if (!('gap' in drop.where)) return false
  if (drag.kind === 'marker') return drop.where.gap >= drag.min && drop.where.gap <= drag.max
  return drop.where.chapterId === drag.chapterId || drop.where.chapterId === drag.nextId
}

/** Whether what's dragged can go on top of a column: beats, no two of one arc at one moment. */
function stackable(drop: DropData, drag: DragData | undefined, activeId: string): boolean {
  if (drag && drag.kind !== 'beats') return false
  const moving = drag?.moving ?? [activeId]
  const movingArcs = drag?.arcs ?? []
  if (new Set(movingArcs).size !== movingArcs.length) return false
  const staying = drop.arcs.filter((_, i) => !moving.includes(drop.beats[i]))
  return staying.length > 0 && !staying.some((arc) => movingArcs.includes(arc))
}

/**
 * Where dragged beats would go, by the pointer's place across the timeline:
 * onto the column under it (to happen at once with those beats, if none is of
 * their arcs), or else into the nearest gap. A book line or a chapter edge
 * goes into the nearest gap it can move to.
 */
const byPointer: CollisionDetection = ({ active, collisionRect, droppableRects, droppableContainers, pointerCoordinates }) => {
  const x = pointerCoordinates?.x ?? collisionRect.left + collisionRect.width / 2
  const drag = active.data.current as DragData | undefined
  let best: (typeof droppableContainers)[number] | undefined
  let bestDistance = Infinity
  for (const container of droppableContainers) {
    const rect = droppableRects.get(container.id)
    const drop = container.data.current as DropData | undefined
    if (!rect || !drop || !fits(drop, drag)) continue
    if (drop.kind === 'column') {
      const edge = rect.width * 0.2
      if (x >= rect.left + edge && x <= rect.right - edge && stackable(drop, drag, String(active.id))) {
        return [{ id: container.id, data: { droppableContainer: container, value: 0 } }]
      }
      continue
    }
    const distance = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
    if (distance < bestDistance) {
      best = container
      bestDistance = distance
    }
  }
  return best ? [{ id: best.id, data: { droppableContainer: best, value: bestDistance } }] : []
}

/**
 * With the keyboard, ← and → step picked-up beats to the next gap, or column
 * they can go on top of (and a book line or chapter edge to the next gap it
 * can go to).
 */
const stepThroughSlots: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const step = event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : 0
  const { active, collisionRect, droppableRects, droppableContainers } = context
  if (!step || !active || !collisionRect) return undefined
  event.preventDefault()
  const x = collisionRect.left + collisionRect.width / 2
  const drag = active.data.current as DragData | undefined
  const centers = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id)
      const drop = container.data.current as DropData | undefined
      if (!rect || !drop || !fits(drop, drag)) return []
      if (drop.kind === 'column' && !drop.beats.includes(String(active.id)) && !stackable(drop, drag, String(active.id))) return []
      return [rect.left + rect.width / 2]
    })
    .sort((a, b) => a - b)
  const next = step < 0 ? centers.filter((c) => c < x - 1).pop() : centers.find((c) => c > x + 1)
  return next === undefined ? undefined : { x: currentCoordinates.x + next - x, y: currentCoordinates.y }
}

/** The grid column under a point: its slot (-1 for the lane names), and where in it. */
function slotAt(grid: HTMLElement, clientX: number): { index: number; x: number; width: number } | null {
  const widths = getComputedStyle(grid).gridTemplateColumns.split(' ').map(parseFloat)
  const x = clientX - grid.getBoundingClientRect().left
  let left = 0
  for (const [i, width] of widths.entries()) {
    if (x < left + width) return { index: i - 1, x: x - left, width }
    left += width
  }
  return null
}

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input, textarea, [contenteditable]')

/**
 * Every beat on one line of time, in a lane for its arc: in the order things
 * happen in the story's world, or in the order they're read. Beats can be
 * dragged to another place in either (in reading order, into another chapter
 * or place in it), or onto other beats to happen at the same moment, one at
 * a time or several picked out with a box. A + by the pointer adds a beat
 * there, or at the same time as the beats above or below it. Beats told out
 * of order are marked. In story order, two lines mark where the book begins
 * and ends (what happens before is backstory, after is aftermath), dragged
 * to their place in time; in reading order, the edge between two chapters
 * is dragged to move beats from one into the other.
 */
export function TimelinePage() {
  const chapters = useStory((s) => s.chapters)
  const arcs = useStory((s) => s.arcs)
  const beats = useStory((s) => s.beats)
  const timeline = useStory((s) => s.timeline)
  const moveInStory = useStory((s) => s.moveInStory)
  const moveInReading = useStory((s) => s.moveInReading)
  const addBeatInStory = useStory((s) => s.addBeatInStory)
  const addBeatInReading = useStory((s) => s.addBeatInReading)
  const putTimeInReadingOrder = useStory((s) => s.resetTimeline)
  const moveBookMarker = useStory((s) => s.moveBookMarker)
  const moveChapterEdge = useStory((s) => s.moveChapterEdge)
  const putChaptersInStoryOrder = useStory((s) => s.matchStoryOrder)
  const mode = useUi((s) => s.timelineMode)
  const setMode = useUi((s) => s.setTimelineMode)
  const lookup = useMentionLookup()
  const grid = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dragging, setDragging] = useState<DragData | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [addAt, setAddAt] = useState<AddAt | null>(null)
  const [picked, setPicked] = useState<Set<string>>(NO_SELECTION)
  const [band, setBand] = useState<{ l: number; t: number; r: number; b: number } | null>(null)

  const story = useMemo(() => storyOrder({ chapters, arcs, beats, timeline }), [chapters, arcs, beats, timeline])
  const jumps = useMemo(() => timeJumps(story, chapters.flatMap((c) => c.beatIds)), [story, chapters])
  // Whether matching this order to the other would change anything.
  const unmatched = useMemo(() => {
    const data = { chapters, arcs, beats, timeline }
    return (mode === 'story' ? resetTimeline(data) : matchStoryOrder(data)) !== data
  }, [mode, chapters, arcs, beats, timeline])
  const numbers = useMemo(() => chapterNumbers(chapters), [chapters])
  const lanes = new Map(arcs.map((a, i) => [a.id, i]))
  const openDraft = draft?.mode === mode ? draft : null
  // Beats picked out, in the order they're shown (those deleted meanwhile left out).
  const selected = useMemo(() => [...picked].filter((id) => beats[id]), [picked, beats])
  const selection = useMemo(() => new Set(selected), [selected])

  const { slots, headings, last } = useMemo(() => {
    const slots: Slot[] = []
    const headings: Heading[] = []
    const gap = (key: string, where: GapWhere, title: string, wide = false) => {
      slots.push({ kind: 'gap', key, where, title, wide })
      if (!wide && openDraft && sameGap(openDraft.where, where)) slots.push({ kind: 'draft', key: `${key}-draft` })
    }
    // Where an arc's own + adds a beat: at the end of the book, or after everything else.
    let last: GapWhere
    if (mode === 'story') {
      const stops = storyStops({ chapters, arcs, beats, timeline })
      const start = stops.findIndex((s) => !isMoment(s) && s.marker === 'start')
      const end = stops.findIndex((s) => !isMoment(s) && s.marker === 'end')
      const at: number[] = []
      stops.forEach((stop, i) => {
        // Nothing in the book yet: room to add its first beat.
        const empty = i === end && end === start + 1
        const title = i <= start ? 'Add a beat before the book begins' : i > end ? 'Add a beat after the book ends' : empty ? 'Add a beat in the book' : 'Add a beat at this point in time'
        gap(`g${i}`, { gap: i }, title, empty)
        at.push(slots.length)
        if (isMoment(stop)) slots.push({ kind: 'column', key: `c-${stop.beats[0]}`, where: { column: i }, beats: stop.beats })
        else {
          const [min, max] = stop.marker === 'start' ? [0, end] : [start + 1, stops.length]
          slots.push({ kind: 'marker', key: `m-${stop.marker}`, marker: stop.marker, drag: { kind: 'marker', marker: stop.marker, min, max } })
        }
      })
      gap(`g${stops.length}`, { gap: stops.length }, 'Add a beat after the book ends')
      last = { gap: end }
      // Moments with the same "when" under one label, but never across the book's lines.
      const whenOf = (i: string) => {
        const stop = stops[Number(i)]
        return isMoment(stop) ? stop.beats.map((id) => beats[id]?.when).find((w) => w?.trim()) : undefined
      }
      for (const span of labelSpans(stops.map((_, i) => String(i)), whenOf)) {
        headings.push({ from: at[span.start], to: at[span.end - 1] + 1, label: span.label })
      }
    } else {
      const sections = readingSections({ chapters, arcs, beats })
      if (!sections.some((s) => s.chapterId === null)) sections.push({ chapterId: null, columns: [] })
      for (const { chapterId, columns } of sections) {
        const from = slots.length
        const chapter = chapters.find((c) => c.id === chapterId)
        const title = chapter ? plainText(chapter.title, lookup).trim() : ''
        const label = chapterId ? `${numbers[chapterId]}${title ? ` · ${title}` : ''}` : 'Not in a chapter'
        const into = chapterId ? `to chapter ${numbers[chapterId]}` : 'in no chapter'
        const key = chapterId ?? 'none'
        if (!columns.length) gap(`${key}-g0`, { chapterId, gap: 0 }, `Add a beat ${into}`, true)
        columns.forEach((ids, i) => {
          gap(`${key}-g${i}`, { chapterId, gap: i }, `Add a beat ${into}`)
          slots.push({ kind: 'column', key: `c-${ids[0]}`, where: { chapterId, column: i }, beats: ids })
        })
        if (columns.length) gap(`${key}-g${columns.length}`, { chapterId, gap: columns.length }, `Add a beat ${into}`)
        headings.push({ from, to: slots.length, label, chapterId, columns: columns.length })
      }
      last = { chapterId: null, gap: sections[sections.length - 1].columns.length }
    }
    return { slots, headings, last }
  }, [mode, chapters, arcs, beats, timeline, lookup, numbers, openDraft])

  // Esc lets go of the beats picked out.
  useEffect(() => {
    if (!selected.length) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || dragging || isTyping(e.target) || document.querySelector('.modal')) return
      setPicked(NO_SELECTION)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.length, dragging])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    // Space picks a beat up (Enter opens it).
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
      coordinateGetter: stepThroughSlots,
      // It may scroll the timeline instead of moving the beat: at once, so the next step starts from there.
      scrollBehavior: 'auto',
    }),
  )

  const endDrag = () => {
    setDragging(null)
    setOverId(null)
    grid.current?.style.removeProperty('--tl-dx')
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    endDrag()
    const drop = over?.data.current as DropData | undefined
    const drag = active.data.current as DragData | undefined
    if (!drop || !drag || !fits(drop, drag)) return
    const { where } = drop
    if (drag.kind === 'marker') {
      if ('gap' in where) moveBookMarker(drag.marker, where.gap)
    } else if (drag.kind === 'edge') {
      // The first chapter keeps its columns before the gap (or all of them, and the next one's before it).
      if ('gap' in where) moveChapterEdge(drag.chapterId, where.chapterId === drag.chapterId ? where.gap : drag.columns + where.gap)
    } else if (mode === 'story') moveInStory(drag.moving, where)
    else moveInReading(drag.moving, { ...where, chapterId: where.chapterId ?? null })
  }

  /** The chapters follow story time, once the writer has seen what that does. */
  const matchChapters = async () => {
    const inBook = beatsInBook({ chapters, arcs, beats, timeline })
    const all = Object.values(beats)
    const leaving = all.filter((b) => b.chapterId && !inBook.has(b.id)).length
    const joining = all.filter((b) => !b.chapterId && inBook.has(b.id)).length
    const beatsWord = (n: number) => `${n} beat${n === 1 ? '' : 's'}`
    const ok = await askConfirm({
      title: 'Put the chapters in story order?',
      message: [
        `The beats between where the book begins and ends go into the chapters in the order they happen, ${
          chapters.some((c) => c.beatIds.length) ? 'each chapter taking about the same share of them as it has now' : 'shared out evenly'
        }.`,
        joining ? `That puts ${beatsWord(joining)} not in a chapter yet into one.` : '',
        leaving
          ? `${beatsWord(leaving)} happening before the book begins or after it ends will come out of ${leaving === 1 ? 'its chapter' : 'their chapters'}.`
          : '',
        'You can undo this.',
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: 'Match story order',
    })
    if (ok) putChaptersInStoryOrder()
  }

  const add = (title: string) => {
    if (!openDraft || !title.trim()) return
    const init = { arcId: openDraft.arcId, title: title.trim() }
    if (mode === 'story') addBeatInStory(init, openDraft.where)
    else addBeatInReading(init, { ...openDraft.where, chapterId: openDraft.where.chapterId ?? null })
    setDraft(null)
  }

  /** The + by the pointer: in the gap it's in or nearest, or in a column's empty place in its lane. */
  const placePlus = (e: React.PointerEvent) => {
    if (dragging || band || !grid.current) return
    const lane = (e.target as Element).closest('[data-lane]')
    const arcId = lane && !lane.classList.contains('tl-lane-head') ? lane.getAttribute('data-lane') : null
    let next: AddAt | null = null
    const at = arcId ? slotAt(grid.current, e.clientX) : null
    const slot = at ? slots[at.index] : undefined
    if (arcId && at && slot?.kind === 'gap') next = { arcId, slot: at.index }
    else if (arcId && at && slot?.kind === 'column') {
      const inside = at.x > at.width * 0.2 && at.x < at.width * 0.8
      const near = at.x < at.width / 2 ? at.index - 1 : at.index + 1
      const writing = openDraft?.arcId === arcId && 'column' in openDraft.where && openDraft.where.column === slot.where.column
      if (!inside) next = slots[near]?.kind === 'gap' ? { arcId, slot: near } : null
      else if (!writing && !slot.beats.some((b) => beats[b]?.arcId === arcId)) next = { arcId, slot: at.index }
    }
    if (next?.arcId !== addAt?.arcId || next?.slot !== addAt?.slot) setAddAt(next)
  }

  /** Dragging across empty timeline picks out the beats in the box (with Shift or Ctrl, as well as those picked already). */
  const startBox = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return placePlus(e)
    const el = grid.current
    if (e.button !== 0 || !el || (e.target as Element).closest('.tl-card, .tl-lane-head, .tl-new-arc, .tl-marker, .tl-mark-head, .tl-edge, button, textarea, input, a')) return
    // Not on the timeline's scroll bars.
    const frame = e.currentTarget.getBoundingClientRect()
    if (e.clientX >= frame.left + e.currentTarget.clientWidth || e.clientY >= frame.top + e.currentTarget.clientHeight) return
    e.preventDefault()
    const origin = el.getBoundingClientRect()
    const start = { x: e.clientX - origin.left, y: e.clientY - origin.top }
    const adding = e.shiftKey || e.ctrlKey || e.metaKey
    const base = adding ? selection : NO_SELECTION
    let moved = false
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const p = { x: ev.clientX - r.left, y: ev.clientY - r.top }
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 5) return
      if (!moved) setAddAt(null)
      moved = true
      const box = { l: Math.min(start.x, p.x), t: Math.min(start.y, p.y), r: Math.max(start.x, p.x), b: Math.max(start.y, p.y) }
      setBand(box)
      const hit = new Set(base)
      el.querySelectorAll<HTMLElement>('.tl-card[data-beat]').forEach((card) => {
        const c = card.getBoundingClientRect()
        const left = c.left - r.left
        const top = c.top - r.top
        if (left < box.r && left + c.width > box.l && top < box.b && top + c.height > box.t) hit.add(card.dataset.beat!)
      })
      setPicked(hit)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setBand(null)
      // A click on empty timeline lets go of them all.
      if (!moved && !adding) setPicked(NO_SELECTION)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const pick = (id: string) =>
    setPicked((was) => {
      const next = new Set([...was].filter((b) => beats[b]))
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const overSlot = overId ? slots.find((s) => `slot-${s.key}` === overId) : undefined
  const stackingOn = overSlot?.kind === 'column' && dragging?.kind === 'beats' && overSlot.beats.some((b) => !dragging.moving.includes(b)) ? overSlot : null
  const rows = arcs.length
  const plus = addAt && !dragging && !band ? slots[addAt.slot] : undefined
  const plusArc = addAt ? arcs.find((a) => a.id === addAt.arcId) : undefined
  const lineAt = (marker: BookMarker) => slots.findIndex((s) => s.kind === 'marker' && s.marker === marker)
  const startAt = lineAt('start')
  const endAt = lineAt('end')
  // While a book line or chapter edge is dragged over a gap: the slots whose beats it would carry across, [from, to).
  const sweep = (() => {
    if (!dragging || dragging.kind === 'beats' || overSlot?.kind !== 'gap') return null
    const to = slots.indexOf(overSlot)
    const from = dragging.kind === 'marker' ? lineAt(dragging.marker) : (headings.find((h) => h.chapterId === dragging.nextId)?.from ?? -1)
    if (from === -1) return null
    // A chapter edge stands at the start of the next chapter's first gap; a book line in a slot of its own.
    const [a, b] = to < from ? [to + 1, from] : [from + 1, to]
    return b > a ? { from: a, to: b } : null
  })()

  return (
    <main className="timeline-page">
      <header className="tl-bar">
        <h1 className="tl-title">Timeline</h1>
        <div className="mode-switch" role="tablist" aria-label="Order">
          {MODES.map((m) => (
            <button
              key={m.mode}
              role="tab"
              aria-selected={mode === m.mode}
              className={`mode-tab${mode === m.mode ? ' active' : ''}`}
              onClick={() => setMode(m.mode)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="tl-hint">
          {mode === 'story'
            ? 'When things happen in the story’s world. Drag beats to move them in time, or onto another arc’s beat so they happen at once. Drag the two lines to where the book begins and ends. Drag across empty space to pick out several.'
            : 'The order readers meet things. Drag beats to another place or chapter, or onto another arc’s beat to tell them together. Drag the line between two chapters to move beats from one to the other. Drag across empty space to pick out several.'}
        </p>
        {selected.length > 0 && (
          <span className="tl-picked" role="status">
            {selected.length} beat{selected.length === 1 ? '' : 's'} picked out: drag one to move {selected.length === 1 ? 'it' : 'them all'}
            <button className="icon-btn" onClick={() => setPicked(NO_SELECTION)} aria-label="Let go of the beats picked out" title="Let go (Esc)">
              <X size={14} />
            </button>
          </span>
        )}
        {mode === 'story' && (
          <button
            className="btn ghost small"
            onClick={putTimeInReadingOrder}
            disabled={!unmatched}
            title={unmatched ? 'Put the beats that are read back in the order they’re read' : 'Story time already follows the reading order'}
          >
            <History size={15} /> Match reading order
          </button>
        )}
        {mode === 'reading' && chapters.length > 0 && (
          <button
            className="btn ghost small"
            onClick={matchChapters}
            disabled={!unmatched}
            title={unmatched ? 'Put the beats into the chapters in the order they happen' : 'The chapters already follow story order'}
          >
            <ListRestart size={15} /> Match story order
          </button>
        )}
      </header>
      {arcs.length === 0 ? (
        <div className="tl-empty">
          <strong>No arcs yet</strong>
          <span>Beats belong to arcs. Add one, then its beats, in the order they happen.</span>
          <NewArc />
        </div>
      ) : (
        <div className="tl-scroll" onPointerDown={startBox}>
          <DndContext
            sensors={sensors}
            collisionDetection={byPointer}
            modifiers={[restrictToHorizontalAxis]}
            onDragStart={({ active }) => {
              const drag = active.data.current as DragData
              setDraft(null)
              setAddAt(null)
              // Picking up a beat that isn't picked out moves it alone.
              if (drag.kind === 'beats' && !selection.has(String(active.id))) setPicked(NO_SELECTION)
              setDragging(drag)
            }}
            onDragMove={({ delta }) => grid.current?.style.setProperty('--tl-dx', `${delta.x}px`)}
            onDragOver={({ over }) => setOverId(over ? String(over.id) : null)}
            onDragEnd={onDragEnd}
            onDragCancel={endDrag}
          >
            <div
              ref={grid}
              className={`tl-grid${dragging ? ' is-dragging' : ''}${band ? ' is-boxing' : ''}`}
              style={{
                gridTemplateColumns: `var(--tl-head) ${slots
                  .map((s) => (s.kind === 'marker' ? 'var(--tl-mark)' : s.kind === 'gap' && !s.wide ? 'var(--tl-gap)' : 'var(--tl-col)'))
                  .join(' ')}`,
                gridTemplateRows: `auto repeat(${rows}, minmax(var(--tl-row), auto)) auto`,
              }}
              onPointerMove={placePlus}
              onPointerLeave={() => setAddAt(null)}
            >
              <div className="tl-corner" style={{ gridRow: 1, gridColumn: 1 }}>
                {mode === 'story' ? 'When' : 'Chapter'}
              </div>
              <div className="tl-axis" style={{ gridRow: 1, gridColumn: `2 / span ${slots.length}` }} aria-hidden />
              {headings.map((h) => (
                <div key={`${h.from}-${h.label}`} className="tl-span" style={{ gridRow: 1, gridColumn: `${h.from + 2} / ${h.to + 2}` }}>
                  <span>{h.label}</span>
                </div>
              ))}
              {arcs.map((arc, i) => (
                <Lane
                  key={arc.id}
                  arc={arc}
                  row={i + 2}
                  columns={slots.length}
                  addTitle={mode === 'story' ? 'Add a beat at the end of the book' : 'Add a beat after everything else'}
                  onAdd={() => setDraft({ mode, arcId: arc.id, where: last })}
                />
              ))}
              <NewArc row={rows + 2} />
              {/* Before the book begins and after it ends. */}
              {startAt > 0 && <div className="tl-outside" style={{ gridRow: `2 / span ${rows}`, gridColumn: `2 / ${startAt + 2}` }} aria-hidden />}
              {endAt !== -1 && endAt < slots.length - 1 && (
                <div className="tl-outside" style={{ gridRow: `2 / span ${rows}`, gridColumn: `${endAt + 3} / ${slots.length + 2}` }} aria-hidden />
              )}
              {sweep && <div className="tl-sweep" style={{ gridRow: `2 / span ${rows}`, gridColumn: `${sweep.from + 2} / ${sweep.to + 2}` }} aria-hidden />}
              {slots.map((slot, i) =>
                slot.kind === 'gap' || slot.kind === 'column' ? (
                  <SlotTarget key={`slot-${slot.key}`} slot={slot} column={i + 2} rows={rows} arcOf={(id) => beats[id]?.arcId ?? ''} over={overSlot === slot} />
                ) : null,
              )}
              {/* Before the beats in no chapter, a line; between two chapters, an edge that moves (with the beats, below). */}
              {mode === 'reading' &&
                headings.slice(1).map((h, i) =>
                  headings[i].chapterId && h.chapterId ? null : (
                    <div key={`divider-${h.from}`} className="tl-divider" style={{ gridRow: `2 / span ${rows}`, gridColumn: h.from + 2 }} aria-hidden />
                  ),
                )}
              {slots.map((slot, i) => {
                if (slot.kind !== 'column' || slot.beats.length < 2) return null
                const at = slot.beats.map((id) => lanes.get(beats[id]?.arcId) ?? 0)
                return (
                  <div
                    key={`together-${slot.key}`}
                    className="tl-together"
                    style={{ gridRow: `${Math.min(...at) + 2} / ${Math.max(...at) + 3}`, gridColumn: i + 2 }}
                    aria-hidden
                  />
                )
              })}
              {/* Beats, the book's lines and the chapters' edges, left to right (as the keyboard goes through them). */}
              {slots.map((slot, i) => {
                if (slot.kind === 'marker') return <BookLine key={slot.key} slot={slot} column={i + 2} rows={rows} />
                if (slot.kind === 'gap') {
                  const at = mode === 'reading' ? headings.findIndex((h) => h.from === i) : -1
                  const [before, next] = at > 0 ? [headings[at - 1], headings[at]] : []
                  if (!before?.chapterId || !next?.chapterId) return null
                  return (
                    <ChapterEdge
                      key={`edge-${before.chapterId}`}
                      column={i + 2}
                      rows={rows}
                      drag={{ kind: 'edge', chapterId: before.chapterId, nextId: next.chapterId, columns: before.columns ?? 0 }}
                      label={`Edge between chapters ${numbers[before.chapterId]} and ${numbers[next.chapterId]}`}
                    />
                  )
                }
                if (slot.kind !== 'column') return null
                return slot.beats.map((id) => {
                  const beat = beats[id]
                  const row = lanes.get(beat?.arcId)
                  if (!beat || row === undefined) return null
                  const moving = selection.has(id) ? selected : [id]
                  return (
                    <BeatTile
                      key={id}
                      beat={beat}
                      arc={arcs[row]}
                      row={row + 2}
                      column={i + 2}
                      number={beat.chapterId ? numbers[beat.chapterId] : null}
                      jump={jumps.get(id)}
                      showWhen={mode === 'reading'}
                      together={slot.beats.length > 1}
                      picked={selection.has(id)}
                      carried={dragging?.kind === 'beats' && dragging.moving.length > 1 && dragging.moving.includes(id)}
                      drag={{ kind: 'beats', arcId: beat.arcId, moving, arcs: moving.map((b) => beats[b]?.arcId ?? '') }}
                      onPick={() => pick(id)}
                      onOpen={() => setPicked(NO_SELECTION)}
                    />
                  )
                })
              })}
              {plus && plusArc && addAt && (plus.kind === 'gap' || plus.kind === 'column') && (
                <button
                  key={`add-${plus.key}-${plusArc.id}`}
                  className={plus.kind === 'column' ? 'tl-add-same' : `tl-add${plus.wide ? ' wide' : ''}`}
                  data-lane={plusArc.id}
                  style={{ gridRow: (lanes.get(plusArc.id) ?? 0) + 2, gridColumn: addAt.slot + 2, '--arc': plusArc.color } as React.CSSProperties}
                  onClick={() => {
                    setDraft({ mode, arcId: plusArc.id, where: plus.where })
                    setAddAt(null)
                  }}
                  aria-label={`${plus.kind === 'column' ? 'Add a beat at the same time' : plus.title}: ${plainText(plusArc.name, lookup) || 'Untitled arc'}`}
                  title={plus.kind === 'column' ? 'Add a beat at the same time as these' : plus.title}
                >
                  <Plus size={plus.kind === 'column' ? 15 : 14} />
                  {plus.kind === 'column' && <span>Same time</span>}
                </button>
              )}
              {stackingOn &&
                dragging?.kind === 'beats' &&
                dragging.moving.map((id) => {
                  const row = lanes.get(beats[id]?.arcId)
                  if (row === undefined) return null
                  return (
                    <div
                      key={`ghost-${id}`}
                      className="tl-stack-ghost"
                      style={{ gridRow: row + 2, gridColumn: slots.indexOf(stackingOn) + 2, '--arc': arcs[row].color } as React.CSSProperties}
                      aria-hidden
                    >
                      At the same time
                    </div>
                  )
                })}
              {openDraft &&
                (() => {
                  const row = lanes.get(openDraft.arcId)
                  const where = openDraft.where
                  const at =
                    'column' in where
                      ? slots.findIndex((s) => s.kind === 'column' && s.where.column === where.column && s.where.chapterId === where.chapterId)
                      : slots.findIndex((s) => s.kind === 'draft' || (s.kind === 'gap' && s.wide && sameGap(s.where, where)))
                  if (row === undefined || at === -1) return null
                  return (
                    <NewBeatCard
                      key={`${openDraft.arcId}-${where.chapterId}-${'gap' in where ? `g${where.gap}` : `c${where.column}`}`}
                      arc={arcs[row]}
                      arcName={plainText(arcs[row].name, lookup) || 'Untitled arc'}
                      row={row + 2}
                      column={at + 2}
                      together={'column' in where}
                      onAdd={add}
                      onCancel={() => setDraft(null)}
                    />
                  )
                })()}
              {band && <div className="tl-box" style={{ left: band.l, top: band.t, width: band.r - band.l, height: band.b - band.t }} aria-hidden />}
            </div>
          </DndContext>
        </div>
      )}
    </main>
  )
}

function Lane({ arc, row, columns, addTitle, onAdd }: { arc: Arc; row: number; columns: number; addTitle: string; onAdd: () => void }) {
  const navigate = useNavigate()
  const lookup = useMentionLookup()
  return (
    <>
      <div
        className="tl-lane-head"
        data-lane={arc.id}
        style={{ gridRow: row, gridColumn: 1, '--arc': arc.color } as React.CSSProperties}
        onDoubleClick={(e) => {
          if (!(e.target as Element).closest('button')) navigate(`/arcs/${arc.id}`)
        }}
        title="Double-click to open the arc"
      >
        <span className="arc-dot" />
        <span className="tl-lane-name">
          <MentionText text={arc.name} fallback="Untitled arc" />
        </span>
        <button
          className="tl-lane-add"
          onClick={onAdd}
          aria-label={`${addTitle}: ${plainText(arc.name, lookup) || 'Untitled arc'}`}
          title={addTitle}
        >
          <Plus size={14} />
        </button>
      </div>
      <div
        className="tl-lane"
        data-lane={arc.id}
        style={{ gridRow: row, gridColumn: `2 / span ${columns}`, '--arc': arc.color } as React.CSSProperties}
        aria-hidden
      />
    </>
  )
}

/** A new arc, named right here: it gets the next arc colour (change it on the arc's page). */
function NewArc({ row }: { row?: number }) {
  const arcs = useStory((s) => s.arcs)
  const addArc = useStory((s) => s.addArc)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const style = row ? { gridRow: row, gridColumn: 1 } : undefined
  const close = () => {
    setOpen(false)
    setName('')
  }
  if (!open) {
    return (
      <button className="tl-new-arc" style={style} onClick={() => setOpen(true)}>
        <Plus size={15} /> New arc
      </button>
    )
  }
  const color = nextArcColor(arcs.map((a) => a.color))
  return (
    <div className="tl-new-arc open" style={{ ...style, '--arc': color } as React.CSSProperties}>
      <span className="arc-dot" />
      <MentionTextarea
        autoFocus
        className="tl-new-arc-input"
        value={name}
        onChange={setName}
        placeholder="Arc name"
        aria-label="New arc name"
        submitOnEnter
        onSubmit={(text) => {
          if (!text.trim()) return
          addArc({ name: text.trim(), color })
          close()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            close()
          }
        }}
        onBlur={() => {
          if (!name.trim()) close()
        }}
      />
    </div>
  )
}

/**
 * Where the book begins or ends in story time: a line through every lane,
 * dragged (by itself or its top) to its place in time.
 */
function BookLine({ slot, column, rows }: { slot: Extract<Slot, { kind: 'marker' }>; column: number; rows: number }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: `marker-${slot.marker}`, data: slot.drag })
  const begins = slot.marker === 'start'
  const name = begins ? 'Book begins' : 'Book ends'
  const tip = begins
    ? 'Where the book begins: drag it to its place in time. What happens before it is backstory.'
    : 'Where the book ends: drag it to its place in time. What happens after it is aftermath.'
  const move = CSS.Translate.toString(transform)
  const state = `${slot.marker}${isDragging ? ' dragging' : ''}`
  return (
    <>
      <div className={`tl-mark-head ${state}`} style={{ gridRow: 1, gridColumn: column, transform: move }} title={tip} {...listeners} aria-hidden>
        {begins ? <BookOpen size={13} /> : <Book size={13} />}
      </div>
      <div
        ref={setNodeRef}
        className={`tl-marker ${state}`}
        style={{ gridRow: `2 / span ${rows}`, gridColumn: column, transform: move }}
        title={tip}
        {...attributes}
        {...listeners}
        aria-roledescription="movable line"
        aria-label={`${name}, in story time`}
      >
        <span className="tl-marker-label">{name}</span>
      </div>
    </>
  )
}

/** The edge between two chapters in reading order: dragged into either, the beats it passes go into the other. */
function ChapterEdge({ column, rows, drag, label }: { column: number; rows: number; drag: EdgeDrag; label: string }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: `edge-${drag.chapterId}`, data: drag })
  return (
    <div
      ref={setNodeRef}
      className={`tl-edge${isDragging ? ' dragging' : ''}`}
      style={{ gridRow: `2 / span ${rows}`, gridColumn: column, transform: CSS.Translate.toString(transform) }}
      title="Drag to move beats from one chapter into the other"
      {...attributes}
      {...listeners}
      aria-roledescription="movable chapter edge"
      aria-label={label}
    >
      <span className="tl-edge-grip">
        <GripVertical size={12} />
      </span>
    </div>
  )
}

/** A slot as a place to drop beats: the whole height of the timeline. */
function SlotTarget({
  slot,
  column,
  rows,
  arcOf,
  over,
}: {
  slot: Extract<Slot, { kind: 'gap' | 'column' }>
  column: number
  rows: number
  arcOf: (beatId: string) => string
  over: boolean
}) {
  const beatIds = slot.kind === 'column' ? slot.beats : []
  const data: DropData = { kind: slot.kind, where: slot.where, beats: beatIds, arcs: beatIds.map(arcOf) }
  const { setNodeRef } = useDroppable({ id: `slot-${slot.key}`, data })
  return (
    <div
      ref={setNodeRef}
      className={`tl-slot ${slot.kind}${slot.kind === 'gap' && slot.wide ? ' wide' : ''}${over ? ' over' : ''}`}
      style={{ gridRow: `2 / span ${rows}`, gridColumn: column }}
      aria-hidden
    />
  )
}

interface NewBeatProps {
  arc: Arc
  arcName: string
  row: number
  column: number
  /** At the same time as the beats in its column. */
  together: boolean
  onAdd: (title: string) => void
  onCancel: () => void
}

/** Writing a new beat where its + was: Enter adds it, Escape (or leaving it empty) doesn't. */
function NewBeatCard({ arc, arcName, row, column, together, onAdd, onCancel }: NewBeatProps) {
  const [title, setTitle] = useState('')
  return (
    <div className="tl-card tl-draft" data-lane={arc.id} style={{ gridRow: row, gridColumn: column, '--arc': arc.color } as React.CSSProperties}>
      <MentionTextarea
        autoFocus
        className="tl-draft-input"
        value={title}
        onChange={setTitle}
        placeholder={together ? 'What happens at the same time?' : 'What happens?'}
        aria-label={`New beat in ${arcName}`}
        submitOnEnter
        onSubmit={onAdd}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        onBlur={() => {
          if (!title.trim()) onCancel()
        }}
      />
      <span className="tl-draft-hint">Enter to add · Esc to cancel</span>
    </div>
  )
}

const JUMP_LABEL: Record<Jump, string> = { flashback: 'Flashback', 'flash-forward': 'Flash-forward' }

interface TileProps {
  beat: Beat
  arc: Arc
  row: number
  column: number
  number: number | null
  jump?: Jump
  showWhen: boolean
  /** On top of other beats, happening at the same time. */
  together: boolean
  /** Picked out, to move with the others picked out. */
  picked: boolean
  /** Moving along with another picked-out beat being dragged. */
  carried: boolean
  drag: DragData
  onPick: () => void
  onOpen: () => void
}

function BeatTile({ beat, arc, row, column, number, jump, showWhen, together, picked, carried, drag, onPick, onOpen }: TileProps) {
  const openBeat = useUi((s) => s.openBeat)
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: beat.id, data: drag })
  return (
    <div
      ref={setNodeRef}
      className={`tl-card draggable${isDragging ? ' dragging' : ''}${together ? ' together' : ''}${picked ? ' picked' : ''}${carried && !isDragging ? ' carried' : ''}`}
      data-lane={arc.id}
      data-beat={beat.id}
      style={
        {
          gridRow: row,
          gridColumn: column,
          '--arc': arc.color,
          transform: CSS.Translate.toString(transform),
        } as React.CSSProperties
      }
      {...attributes}
      {...listeners}
      aria-roledescription="movable beat"
      aria-pressed={picked}
      onClick={(e) => {
        // Shift- or Ctrl-click picks it out (or lets go of it); a click opens it.
        if (e.shiftKey || e.ctrlKey || e.metaKey) return onPick()
        onOpen()
        openBeat(beat.id)
      }}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        if (e.key === 'Enter' && !e.defaultPrevented) openBeat(beat.id)
      }}
    >
      <span className="tl-card-title">
        <MentionText text={beat.title} fallback={<span className="muted">Untitled beat</span>} />
      </span>
      <span className="tl-card-foot">
        <ChapterTag number={number} />
        {showWhen && beat.when && <span className="tl-when">{beat.when}</span>}
        {jump && (
          <span className={`tl-jump ${jump}`} title={jump === 'flashback' ? 'Read later than things that happen after it' : 'Read earlier than things that happen before it'}>
            {jump === 'flashback' ? <Rewind size={11} /> : <FastForward size={11} />}
            {JUMP_LABEL[jump]}
          </span>
        )}
        {beat.done && <Check size={13} className="tl-done" aria-label="Written" />}
      </span>
    </div>
  )
}
