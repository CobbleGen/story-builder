import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useStory } from '../store/storyStore'
import type { ChapterLayout } from '../store/storyOps'
import { insertionIndex, moveInLayout } from '../lib/placement'
import { Sidebar } from '../components/Sidebar'
import { BeatCardView } from '../components/BeatCard'
import { chapterSortId, type BeatDragData, type ChapterDragData, type DragData } from '../lib/dnd'
import { flash } from '../lib/flash'
import { useScrollMemory } from '../lib/trail'
import { ChapterColumn, ChapterOverlay } from './ChapterColumn'

const dragData = (item: { data: { current?: unknown } } | null | undefined) =>
  item?.data.current as DragData | undefined

/**
 * Chapters only collide with chapters. Beats land in the chapter (or the
 * sidebar drop zone) under the pointer; the exact slot is worked out from the
 * card midpoints in onDragMove. (A dragged beat can lose its data while its
 * card is out of every chapter, so anything that isn't a chapter is a beat.)
 */
const collisionDetection: CollisionDetection = (args) => {
  const type = dragData(args.active)?.type
  if (type === 'chapter') {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((d) => dragData(d)?.type === 'chapter'),
    })
  }
  const targets = args.droppableContainers.filter((d) => {
    const t = dragData(d)?.type
    return t === 'chapter' || t === 'unassign'
  })
  if (!args.pointerCoordinates) return rectIntersection({ ...args, droppableContainers: targets })
  const hits = pointerWithin({ ...args, droppableContainers: targets })
  const unassign = hits.find((h) => targets.find((d) => d.id === h.id && dragData(d)?.type === 'unassign'))
  return unassign ? [unassign] : hits.slice(0, 1)
}

/** Chapters use sortable keyboard moves; beats step down a column or jump across chapters. */
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  if (dragData(args.context.active)?.type === 'chapter') return sortableKeyboardCoordinates(event, args)
  const { x, y } = args.currentCoordinates
  const step: Record<string, [number, number]> = {
    ArrowRight: [296, 0],
    ArrowLeft: [-296, 0],
    ArrowDown: [0, 48],
    ArrowUp: [0, -48],
  }
  const move = step[event.code]
  if (!move) return
  event.preventDefault()
  return { x: x + move[0], y: y + move[1] }
}

function layoutOf(chapters: { id: string; beatIds: string[] }[]): ChapterLayout {
  return Object.fromEntries(chapters.map((c) => [c.id, c.beatIds]))
}

/** Vertical midpoints of a chapter's cards, skipping the one being dragged. */
function cardMidpoints(chapterId: string, skipBeatId: string): number[] {
  const list = document.querySelector(`[data-chapter-list="${CSS.escape(chapterId)}"]`)
  if (!list) return []
  const mids: number[] = []
  for (const el of list.querySelectorAll<HTMLElement>(':scope > [data-beat-id]')) {
    if (el.dataset.beatId === skipBeatId) continue
    const r = el.getBoundingClientRect()
    mids.push(r.top + r.height / 2)
  }
  return mids
}

function activeCenterY(active: Active): number | null {
  const r = active.rect.current.translated
  return r ? r.top + r.height / 2 : null
}

export function BoardPage() {
  const chapters = useStory((s) => s.chapters)
  const beats = useStory((s) => s.beats)
  const arcs = useStory((s) => s.arcs)
  const addChapter = useStory((s) => s.addChapter)
  const moveChapter = useStory((s) => s.moveChapter)
  const applyChapterLayout = useStory((s) => s.applyChapterLayout)

  const [activeDrag, setActiveDrag] = useState<BeatDragData | ChapterDragData | null>(null)
  const [preview, setPreview] = useState<ChapterLayout | null>(null)
  const [dropChapterId, setDropChapterId] = useState<string | null>(null)
  const [focusChapterId, setFocusChapterId] = useState<string | null>(null)
  // What is being dragged. dnd-kit's active.data goes blank while the dragged
  // card is out of every chapter (its node unmounts), so keep our own copy.
  const dragRef = useRef<BeatDragData | ChapterDragData | null>(null)
  const previewRef = useRef<ChapterLayout | null>(null)
  const originalRef = useRef<ChapterLayout | null>(null)
  const pointerY = useRef<number | null>(null)
  const keepScroll = useScrollMemory('board')
  const location = useLocation()
  const navigate = useNavigate()

  // Opened from a search result: bring the chapter into view and make it glow.
  const searched = (location.state as { focusChapter?: string } | null)?.focusChapter
  useEffect(() => {
    if (!searched) return
    const column = document.querySelector<HTMLElement>(`.board .chapter[data-chapter="${CSS.escape(searched)}"]`)
    if (column) {
      column.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      flash(column)
    }
    navigate('.', { replace: true, state: null })
  }, [searched, navigate, location.key])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      // Enter opens a beat; Space picks it up.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  )

  // Track the pointer while dragging; the dragged card's slot follows it.
  useEffect(() => {
    if (activeDrag?.type !== 'beat') return
    const onPointer = (e: PointerEvent) => (pointerY.current = e.clientY)
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) pointerY.current = e.touches[0].clientY
    }
    window.addEventListener('pointermove', onPointer, { capture: true, passive: true })
    window.addEventListener('touchmove', onTouch, { capture: true, passive: true })
    return () => {
      window.removeEventListener('pointermove', onPointer, { capture: true })
      window.removeEventListener('touchmove', onTouch, { capture: true })
    }
  }, [activeDrag?.type])

  const setLayout = (next: ChapterLayout | null) => {
    previewRef.current = next
    setPreview(next)
  }

  const reset = () => {
    dragRef.current = null
    setActiveDrag(null)
    setLayout(null)
    setDropChapterId(null)
    originalRef.current = null
    pointerY.current = null
  }

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const data = dragData(active)
    if (!data || data.type === 'unassign') return
    dragRef.current = data
    setActiveDrag(data)
    if (data.type === 'beat') {
      const layout = layoutOf(chapters)
      originalRef.current = layout
      setLayout(layout)
      pointerY.current =
        activatorEvent instanceof MouseEvent
          ? activatorEvent.clientY
          : typeof TouchEvent !== 'undefined' && activatorEvent instanceof TouchEvent
            ? (activatorEvent.touches[0]?.clientY ?? null)
            : null
    }
  }

  const updatePreview = ({ active, over, activatorEvent }: DragMoveEvent | DragOverEvent) => {
    const data = dragRef.current
    const base = previewRef.current
    if (data?.type !== 'beat' || !base || !over) return
    const target = dragData(over)
    let next = base
    if (target?.type === 'unassign') {
      // Dropping a board beat on the sidebar unplaces it; a sidebar beat just goes back.
      next = data.origin === 'board' ? moveInLayout(base, data.beatId, null) : originalRef.current!
      setDropChapterId(null)
    } else if (target?.type === 'chapter') {
      const isKeyboard = activatorEvent instanceof KeyboardEvent
      const y = (isKeyboard ? null : pointerY.current) ?? activeCenterY(active)
      if (y === null) return
      const index = insertionIndex(cardMidpoints(target.chapterId, data.beatId), y)
      next = moveInLayout(base, data.beatId, target.chapterId, index)
      setDropChapterId(target.chapterId)
    }
    if (next !== base) setLayout(next)
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const data = dragRef.current
    if (data?.type === 'chapter' && over && over.id !== active.id) {
      const from = chapters.findIndex((c) => chapterSortId(c.id) === active.id)
      const to = chapters.findIndex((c) => chapterSortId(c.id) === over.id)
      if (from !== -1 && to !== -1) moveChapter(from, to)
    } else if (data?.type === 'beat' && previewRef.current) {
      applyChapterLayout(previewRef.current)
    }
    reset()
  }

  const insertChapter = useCallback(
    (index?: number) => setFocusChapterId(addChapter({ index })),
    [addChapter],
  )
  const clearFocus = useCallback(() => setFocusChapterId(null), [])

  const activeBeatId = activeDrag?.type === 'beat' ? activeDrag.beatId : null
  const activeBeat = activeBeatId ? beats[activeBeatId] : null
  const activeChapterIndex =
    activeDrag?.type === 'chapter' ? chapters.findIndex((c) => c.id === activeDrag.chapterId) : -1
  const sortIds = useMemo(() => chapters.map((c) => chapterSortId(c.id)), [chapters])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragMove={updatePreview}
      onDragOver={updatePreview}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <div className="workspace">
        <Sidebar dragEnabled unassignActive={activeDrag?.type === 'beat' && activeDrag.origin === 'board'} />
        <main ref={keepScroll} className="board" aria-label="Chapter board">
          <SortableContext items={sortIds} strategy={horizontalListSortingStrategy}>
            {chapters.map((chapter, i) => (
              <ChapterColumn
                key={chapter.id}
                chapter={chapter}
                number={i + 1}
                index={i}
                beatIds={preview?.[chapter.id] ?? chapter.beatIds}
                activeBeatId={activeBeatId}
                isDropTarget={dropChapterId === chapter.id}
                autoFocus={focusChapterId === chapter.id}
                onFocused={clearFocus}
                onInsertChapter={insertChapter}
              />
            ))}
          </SortableContext>
          <button className="add-chapter" onClick={() => insertChapter()}>
            <Plus size={18} /> Add chapter
          </button>
        </main>
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {activeBeat ? (
          <BeatCardView beat={activeBeat} arc={arcs.find((a) => a.id === activeBeat.arcId)} overlay />
        ) : activeChapterIndex !== -1 ? (
          <ChapterOverlay chapter={chapters[activeChapterIndex]} number={activeChapterIndex + 1} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
