import { useMemo } from 'react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { Check, History, Rewind, FastForward } from 'lucide-react'
import type { Arc, Beat } from '../types'
import { chapterNumbers, useMentionLookup, useStory } from '../store/storyStore'
import { useUi, type TimelineMode } from '../store/uiStore'
import { readingOrder, storyOrder } from '../store/storyOps'
import { labelSpans, timeJumps, type Jump, type Span } from '../lib/timeline'
import { plainText } from '../lib/mentions'
import { MentionText } from '../components/MentionText'
import { ChapterTag } from '../components/ChapterTag'

const MODES: { mode: TimelineMode; label: string }[] = [
  { mode: 'story', label: 'Story order' },
  { mode: 'reading', label: 'Reading order' },
]

/** A dragged beat lands in the column nearest it; which lane a card is in doesn't matter. */
const nearestColumn: CollisionDetection = ({ collisionRect, droppableRects, droppableContainers }) => {
  const x = collisionRect.left + collisionRect.width / 2
  let best: (typeof droppableContainers)[number] | undefined
  let bestDistance = Infinity
  for (const container of droppableContainers) {
    const rect = droppableRects.get(container.id)
    if (!rect) continue
    const distance = Math.abs(rect.left + rect.width / 2 - x)
    if (distance < bestDistance) {
      best = container
      bestDistance = distance
    }
  }
  return best ? [{ id: best.id, data: { droppableContainer: best, value: bestDistance } }] : []
}

/**
 * Every beat on one line of time, in a lane for its arc: in the order things
 * happen in the story's world (drag to rearrange, label with "when") or in the
 * order they're read. Beats told out of order are marked.
 */
export function TimelinePage() {
  const chapters = useStory((s) => s.chapters)
  const arcs = useStory((s) => s.arcs)
  const beats = useStory((s) => s.beats)
  const timeline = useStory((s) => s.timeline)
  const moveInTimeline = useStory((s) => s.moveInTimeline)
  const resetTimeline = useStory((s) => s.resetTimeline)
  const mode = useUi((s) => s.timelineMode)
  const setMode = useUi((s) => s.setTimelineMode)
  const lookup = useMentionLookup()

  const reading = useMemo(() => readingOrder({ chapters, arcs, beats }), [chapters, arcs, beats])
  const story = useMemo(() => storyOrder({ chapters, arcs, beats, timeline }), [chapters, arcs, beats, timeline])
  const jumps = useMemo(() => timeJumps(story, chapters.flatMap((c) => c.beatIds)), [story, chapters])
  const order = mode === 'story' ? story : reading
  const arranged = story.some((id, i) => id !== reading[i])
  const numbers = chapterNumbers(chapters)
  const lanes = new Map(arcs.map((a, i) => [a.id, i]))

  const spans: Span[] = useMemo(() => {
    if (mode === 'story') return labelSpans(order, (id) => beats[id]?.when)
    return labelSpans(order, (id) => {
      const chapterId = beats[id]?.chapterId
      if (!chapterId) return 'Not in a chapter'
      const c = chapters.find((ch) => ch.id === chapterId)
      const title = c ? plainText(c.title, lookup).trim() : ''
      return `${numbers[chapterId]}${title ? ` · ${title}` : ''}`
    })
  }, [mode, order, beats, chapters, lookup, numbers])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    moveInTimeline(String(active.id), story.indexOf(String(over.id)))
  }

  const empty = order.length === 0
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
            ? 'When things happen in the story’s world. Drag a beat to move it in time, and open it to say when.'
            : 'The order readers meet things, chapter by chapter. Beats marked as flashbacks happen earlier than this.'}
        </p>
        {mode === 'story' && arranged && timeline.length > 0 && (
          <button className="btn ghost small" onClick={resetTimeline} title="Put every beat back in the order it's read">
            <History size={15} /> Match reading order
          </button>
        )}
      </header>
      {empty ? (
        <div className="tl-empty">
          <strong>No beats yet</strong>
          <span>Add beats to your arcs, and they’ll appear here in the order they happen.</span>
        </div>
      ) : (
        <div className="tl-scroll">
          <DndContext sensors={sensors} collisionDetection={nearestColumn} modifiers={[restrictToHorizontalAxis]} onDragEnd={onDragEnd}>
            <SortableContext items={order} strategy={horizontalListSortingStrategy} disabled={mode !== 'story'}>
              <div
                className="tl-grid"
                style={{
                  gridTemplateColumns: `var(--tl-head) repeat(${order.length}, var(--tl-col))`,
                  gridTemplateRows: `auto repeat(${arcs.length}, minmax(var(--tl-row), auto))`,
                }}
              >
                <div className="tl-corner" style={{ gridRow: 1, gridColumn: 1 }}>
                  {mode === 'story' ? 'When' : 'Chapter'}
                </div>
                <div className="tl-axis" style={{ gridRow: 1, gridColumn: `2 / span ${order.length}` }} aria-hidden />
                {spans.map((s) => (
                  <div key={`${s.start}-${s.label}`} className="tl-span" style={{ gridRow: 1, gridColumn: `${s.start + 2} / ${s.end + 2}` }}>
                    <span>{s.label}</span>
                  </div>
                ))}
                {arcs.map((arc, i) => (
                  <Lane key={arc.id} arc={arc} row={i + 2} columns={order.length} />
                ))}
                {order.map((id, col) => {
                  const beat = beats[id]
                  const lane = lanes.get(beat.arcId)
                  if (lane === undefined) return null
                  return (
                    <BeatTile
                      key={id}
                      beat={beat}
                      arc={arcs[lane]}
                      row={lane + 2}
                      column={col + 2}
                      number={beat.chapterId ? numbers[beat.chapterId] : null}
                      jump={jumps.get(id)}
                      showWhen={mode === 'reading'}
                      draggable={mode === 'story'}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </main>
  )
}

function Lane({ arc, row, columns }: { arc: Arc; row: number; columns: number }) {
  return (
    <>
      <div className="tl-lane-head" style={{ gridRow: row, gridColumn: 1, '--arc': arc.color } as React.CSSProperties}>
        <span className="arc-dot" />
        <span className="tl-lane-name">
          <MentionText text={arc.name} fallback="Untitled arc" />
        </span>
      </div>
      <div className="tl-lane" style={{ gridRow: row, gridColumn: `2 / span ${columns}`, '--arc': arc.color } as React.CSSProperties} aria-hidden />
    </>
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
  draggable: boolean
}

function BeatTile({ beat, arc, row, column, number, jump, showWhen, draggable }: TileProps) {
  const openBeat = useUi((s) => s.openBeat)
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: beat.id, disabled: !draggable })
  return (
    <div
      ref={setNodeRef}
      className={`tl-card${isDragging ? ' dragging' : ''}${draggable ? ' draggable' : ''}`}
      style={
        {
          gridRow: row,
          gridColumn: column,
          '--arc': arc.color,
          transform: CSS.Translate.toString(transform),
          transition,
        } as React.CSSProperties
      }
      {...attributes}
      {...listeners}
      aria-roledescription={draggable ? 'movable beat' : undefined}
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
