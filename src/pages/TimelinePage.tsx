import { useMemo, useState } from 'react'
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
import { Check, FastForward, History, Plus, Rewind } from 'lucide-react'
import type { Arc, Beat } from '../types'
import { chapterNumbers, useMentionLookup, useStory } from '../store/storyStore'
import { useUi, type TimelineMode } from '../store/uiStore'
import { readingOrder, readingSections, storyColumns, storyOrder, type TimelineSpot } from '../store/storyOps'
import { labelSpans, timeJumps, type Jump } from '../lib/timeline'
import { plainText } from '../lib/mentions'
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

/**
 * The timeline, left to right: gaps (to add a beat in, or drop one in at a
 * moment of its own) between columns of beats happening at once. A wide gap
 * stands for an empty chapter, or an empty timeline; a draft is where a new
 * beat is being written.
 */
type Slot =
  | { kind: 'gap'; key: string; where: GapWhere; wide?: boolean; title: string }
  | { kind: 'column'; key: string; where: Where; beats: string[] }
  | { kind: 'draft'; key: string }

/** A span of slots along the top: a chapter, or beats with the same "when". */
interface Heading {
  from: number
  to: number
  label: string
}

interface Draft {
  mode: TimelineMode
  arcId: string
  where: GapWhere
}

interface DropData {
  kind: 'gap' | 'column'
  where: Where
  beats: string[]
  arcs: string[]
}

const sameGap = (a: GapWhere, b: GapWhere) => a.gap === b.gap && a.chapterId === b.chapterId

/**
 * Where a dragged beat would go, by the pointer's place across the timeline:
 * onto the column under it (to happen at once with those beats, if none is of
 * its arc), or else into the nearest gap.
 */
const byPointer: CollisionDetection = ({ active, collisionRect, droppableRects, droppableContainers, pointerCoordinates }) => {
  const x = pointerCoordinates?.x ?? collisionRect.left + collisionRect.width / 2
  const arcId = (active.data.current as { arcId?: string } | undefined)?.arcId
  let best: (typeof droppableContainers)[number] | undefined
  let bestDistance = Infinity
  for (const container of droppableContainers) {
    const rect = droppableRects.get(container.id)
    const drop = container.data.current as DropData | undefined
    if (!rect || !drop) continue
    if (drop.kind === 'column') {
      const edge = rect.width * 0.2
      const free = drop.beats.includes(String(active.id)) || !drop.arcs.includes(arcId ?? '')
      if (free && x >= rect.left + edge && x <= rect.right - edge) return [{ id: container.id, data: { droppableContainer: container, value: 0 } }]
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

/** With the keyboard, ← and → step a picked-up beat to the next gap, or column it can go on top of. */
const stepThroughSlots: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const step = event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : 0
  const { active, collisionRect, droppableRects, droppableContainers } = context
  if (!step || !active || !collisionRect) return undefined
  event.preventDefault()
  const x = collisionRect.left + collisionRect.width / 2
  const arcId = (active.data.current as { arcId?: string } | undefined)?.arcId ?? ''
  const centers = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id)
      const drop = container.data.current as DropData | undefined
      if (!rect || !drop) return []
      if (drop.kind === 'column' && !drop.beats.includes(String(active.id)) && drop.arcs.includes(arcId)) return []
      return [rect.left + rect.width / 2]
    })
    .sort((a, b) => a - b)
  const next = step < 0 ? centers.filter((c) => c < x - 1).pop() : centers.find((c) => c > x + 1)
  return next === undefined ? undefined : { x: currentCoordinates.x + next - x, y: currentCoordinates.y }
}

/**
 * Every beat on one line of time, in a lane for its arc: in the order things
 * happen in the story's world, or in the order they're read. Beats can be
 * dragged to another place in either (in reading order, into another chapter
 * or place in it), or onto other beats to happen at the same moment; + between
 * beats adds one there. Beats told out of order are marked.
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
  const resetTimeline = useStory((s) => s.resetTimeline)
  const mode = useUi((s) => s.timelineMode)
  const setMode = useUi((s) => s.setTimelineMode)
  const lookup = useMentionLookup()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dragging, setDragging] = useState<{ id: string; arcId: string } | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  // The lane the pointer is in, to show its + buttons.
  const [lane, setLane] = useState<string | null>(null)

  const reading = useMemo(() => readingOrder({ chapters, arcs, beats }), [chapters, arcs, beats])
  const story = useMemo(() => storyOrder({ chapters, arcs, beats, timeline }), [chapters, arcs, beats, timeline])
  const jumps = useMemo(() => timeJumps(story, chapters.flatMap((c) => c.beatIds)), [story, chapters])
  const arranged = story.some((id, i) => id !== reading[i])
  const numbers = useMemo(() => chapterNumbers(chapters), [chapters])
  const lanes = new Map(arcs.map((a, i) => [a.id, i]))
  const openDraft = draft?.mode === mode ? draft : null

  const { slots, headings } = useMemo(() => {
    const slots: Slot[] = []
    const headings: Heading[] = []
    const gap = (key: string, where: GapWhere, title: string, wide = false) => {
      slots.push({ kind: 'gap', key, where, title, wide })
      if (!wide && openDraft && sameGap(openDraft.where, where)) slots.push({ kind: 'draft', key: `${key}-draft` })
    }
    if (mode === 'story') {
      const columns = storyColumns({ chapters, arcs, beats, timeline })
      const at: number[] = []
      if (!columns.length) gap('g0', { gap: 0 }, 'Add a beat', true)
      columns.forEach((ids, i) => {
        gap(`g${i}`, { gap: i }, 'Add a beat at this point in time')
        at.push(slots.length)
        slots.push({ kind: 'column', key: `c-${ids[0]}`, where: { column: i }, beats: ids })
      })
      if (columns.length) gap(`g${columns.length}`, { gap: columns.length }, 'Add a beat after everything else')
      const whenOf = (i: string) => columns[Number(i)].map((id) => beats[id]?.when).find((w) => w?.trim())
      for (const span of labelSpans(columns.map((_, i) => String(i)), whenOf)) {
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
        headings.push({ from, to: slots.length, label })
      }
    }
    return { slots, headings }
  }, [mode, chapters, arcs, beats, timeline, lookup, numbers, openDraft])

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

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    setOverId(null)
    const drop = over?.data.current as DropData | undefined
    if (!drop) return
    const id = String(active.id)
    if (mode === 'story') moveInStory(id, drop.where)
    else moveInReading(id, { ...drop.where, chapterId: drop.where.chapterId ?? null })
  }

  const add = (title: string) => {
    if (!openDraft || !title.trim()) return
    const init = { arcId: openDraft.arcId, title: title.trim() }
    if (mode === 'story') addBeatInStory(init, openDraft.where.gap)
    else addBeatInReading(init, { chapterId: openDraft.where.chapterId ?? null, gap: openDraft.where.gap })
    setDraft(null)
  }

  const overSlot = overId ? slots.find((s) => `slot-${s.key}` === overId) : undefined
  const stackingOn = overSlot?.kind === 'column' && dragging && !overSlot.beats.includes(dragging.id) ? overSlot : null
  const rows = arcs.length

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
            ? 'When things happen in the story’s world. Drag a beat to move it in time, or onto another arc’s beat so they happen at once. + adds a beat there.'
            : 'The order readers meet things. Drag a beat to another place or chapter, or onto another arc’s beat to tell them together. + adds a beat there.'}
        </p>
        {mode === 'story' && arranged && timeline.length > 0 && (
          <button className="btn ghost small" onClick={resetTimeline} title="Put every beat back in the order it's read">
            <History size={15} /> Match reading order
          </button>
        )}
      </header>
      {arcs.length === 0 ? (
        <div className="tl-empty">
          <strong>No arcs yet</strong>
          <span>Beats belong to arcs. Create an arc on the chapter board, then add its beats here, in the order they happen.</span>
        </div>
      ) : (
        <div className="tl-scroll">
          <DndContext
            sensors={sensors}
            collisionDetection={byPointer}
            modifiers={[restrictToHorizontalAxis]}
            onDragStart={({ active }) => {
              setDraft(null)
              setDragging({ id: String(active.id), arcId: (active.data.current as { arcId: string }).arcId })
            }}
            onDragOver={({ over }) => setOverId(over ? String(over.id) : null)}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setDragging(null)
              setOverId(null)
            }}
          >
            <div
              className={`tl-grid${dragging ? ' is-dragging' : ''}`}
              style={{
                gridTemplateColumns: `var(--tl-head) ${slots.map((s) => (s.kind === 'gap' && !s.wide ? 'var(--tl-gap)' : 'var(--tl-col)')).join(' ')}`,
                gridTemplateRows: `auto repeat(${rows}, minmax(var(--tl-row), auto))`,
              }}
              onPointerOver={(e) => {
                const over = (e.target as Element).closest('[data-lane]')?.getAttribute('data-lane') ?? null
                if (over !== lane) setLane(over)
              }}
              onPointerLeave={() => setLane(null)}
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
              {mode === 'reading' &&
                headings.slice(1).map((h) => (
                  <div key={`divider-${h.from}`} className="tl-divider" style={{ gridRow: `2 / span ${rows}`, gridColumn: h.from + 2 }} aria-hidden />
                ))}
              {arcs.map((arc, i) => (
                <Lane key={arc.id} arc={arc} row={i + 2} columns={slots.length} />
              ))}
              {slots.map((slot, i) =>
                slot.kind === 'draft' ? null : (
                  <SlotTarget key={`slot-${slot.key}`} slot={slot} column={i + 2} rows={rows} arcOf={(id) => beats[id]?.arcId} over={overSlot === slot} />
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
              {!dragging &&
                slots.map((slot, i) =>
                  slot.kind === 'gap'
                    ? arcs.map((arc, row) =>
                        openDraft && slot.wide && openDraft.arcId === arc.id && sameGap(openDraft.where, slot.where) ? null : (
                          <button
                            key={`add-${slot.key}-${arc.id}`}
                            className={`tl-add${slot.wide ? ' wide' : ''}${lane === arc.id ? ' shown' : ''}`}
                            data-lane={arc.id}
                            style={{ gridRow: row + 2, gridColumn: i + 2, '--arc': arc.color } as React.CSSProperties}
                            onClick={() => setDraft({ mode, arcId: arc.id, where: slot.where })}
                            aria-label={`${slot.title}: ${plainText(arc.name, lookup) || 'Untitled arc'}`}
                            title={slot.title}
                            // Only the last + of each lane (and those in empty chapters) take a turn at the Tab key.
                            tabIndex={slot.wide || i === slots.length - 1 ? 0 : -1}
                          >
                            <Plus size={14} />
                          </button>
                        ),
                      )
                    : null,
                )}
              {slots.map((slot, i) =>
                slot.kind === 'column'
                  ? slot.beats.map((id) => {
                      const beat = beats[id]
                      const row = lanes.get(beat?.arcId)
                      if (!beat || row === undefined) return null
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
                        />
                      )
                    })
                  : null,
              )}
              {stackingOn && dragging && (
                <div
                  className="tl-stack-ghost"
                  style={
                    {
                      gridRow: (lanes.get(dragging.arcId) ?? 0) + 2,
                      gridColumn: slots.indexOf(stackingOn) + 2,
                      '--arc': arcs[lanes.get(dragging.arcId) ?? 0]?.color,
                    } as React.CSSProperties
                  }
                  aria-hidden
                >
                  At the same time
                </div>
              )}
              {openDraft &&
                (() => {
                  const row = lanes.get(openDraft.arcId)
                  const at = slots.findIndex((s) => s.kind === 'draft' || (s.kind === 'gap' && s.wide && sameGap(s.where, openDraft.where)))
                  if (row === undefined || at === -1) return null
                  return (
                    <NewBeatCard
                      key={`${openDraft.arcId}-${openDraft.where.chapterId}-${openDraft.where.gap}`}
                      arc={arcs[row]}
                      arcName={plainText(arcs[row].name, lookup) || 'Untitled arc'}
                      row={row + 2}
                      column={at + 2}
                      onAdd={add}
                      onCancel={() => setDraft(null)}
                    />
                  )
                })()}
            </div>
          </DndContext>
        </div>
      )}
    </main>
  )
}

function Lane({ arc, row, columns }: { arc: Arc; row: number; columns: number }) {
  const navigate = useNavigate()
  return (
    <>
      <div
        className="tl-lane-head"
        data-lane={arc.id}
        style={{ gridRow: row, gridColumn: 1, '--arc': arc.color } as React.CSSProperties}
        onDoubleClick={() => navigate(`/arcs/${arc.id}`)}
        title="Double-click to open the arc"
      >
        <span className="arc-dot" />
        <span className="tl-lane-name">
          <MentionText text={arc.name} fallback="Untitled arc" />
        </span>
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

/** A slot as a place to drop a beat: the whole height of the timeline. */
function SlotTarget({
  slot,
  column,
  rows,
  arcOf,
  over,
}: {
  slot: Exclude<Slot, { kind: 'draft' }>
  column: number
  rows: number
  arcOf: (beatId: string) => string | undefined
  over: boolean
}) {
  const beatIds = slot.kind === 'column' ? slot.beats : []
  const data: DropData = {
    kind: slot.kind,
    where: slot.where,
    beats: beatIds,
    arcs: beatIds.flatMap((id) => arcOf(id) ?? []),
  }
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

/** Writing a new beat where its + was: Enter adds it, Escape (or leaving it empty) doesn't. */
interface NewBeatProps {
  arc: Arc
  arcName: string
  row: number
  column: number
  onAdd: (title: string) => void
  onCancel: () => void
}

function NewBeatCard({ arc, arcName, row, column, onAdd, onCancel }: NewBeatProps) {
  const [title, setTitle] = useState('')
  return (
    <div className="tl-card tl-draft" data-lane={arc.id} style={{ gridRow: row, gridColumn: column, '--arc': arc.color } as React.CSSProperties}>
      <MentionTextarea
        autoFocus
        className="tl-draft-input"
        value={title}
        onChange={setTitle}
        placeholder="What happens?"
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
}

function BeatTile({ beat, arc, row, column, number, jump, showWhen, together }: TileProps) {
  const openBeat = useUi((s) => s.openBeat)
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: beat.id, data: { arcId: beat.arcId } })
  return (
    <div
      ref={setNodeRef}
      className={`tl-card draggable${isDragging ? ' dragging' : ''}${together ? ' together' : ''}`}
      data-lane={arc.id}
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
      onClick={() => openBeat(beat.id)}
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
