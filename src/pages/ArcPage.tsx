import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { BookOpen, ChevronDown, CircleDashed, GripVertical, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { BackLink } from '../components/BackLink'
import { useBack } from '../lib/trail'
import type { Arc, Beat } from '../types'
import { chapterNumbers, useMentionLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { Sidebar } from '../components/Sidebar'
import { MentionTextarea } from '../components/MentionTextarea'
import { MentionText } from '../components/MentionText'
import { CharacterAvatar } from '../components/CharacterAvatar'
import { displayName, plainText } from '../lib/mentions'
import { ColorPicker } from '../components/ColorPicker'
import { askConfirm } from '../lib/confirm'
import { outlineWords } from '../lib/progress'
import { outlineKind } from '../lib/outlines'
import { OutlineBar, OutlineMarkView, OutlineMarks, STEP_TRAY, type StepDragData } from '../components/ArcOutline'

const typeOf = (data: { current?: unknown } | undefined) => (data?.current as { type?: string } | undefined)?.type

/** Beats sort among themselves; an outline's step lands on the beat (or the tray of steps on none) under the pointer. */
const arcCollisions: CollisionDetection = (args) => {
  if (typeOf(args.active.data) === 'step') {
    const targets = args.droppableContainers.filter((d) => typeOf(d.data) === 'beat' || d.id === STEP_TRAY)
    return args.pointerCoordinates ? pointerWithin({ ...args, droppableContainers: targets }) : []
  }
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((d) => typeOf(d.data) === 'beat') })
}

/** Beats move up and down in their list; steps anywhere. */
const arcModifier: Modifier = (args) =>
  typeOf(args.active?.data) === 'step' ? args.transform : restrictToParentElement({ ...args, transform: restrictToVerticalAxis(args) })

export function ArcPage() {
  const { arcId } = useParams()
  const arc = useStory((s) => s.arcs.find((a) => a.id === arcId))
  const setSidebarMode = useUi((s) => s.setSidebarMode)
  useEffect(() => setSidebarMode('arcs'), [setSidebarMode])

  return (
    <div className="workspace">
      <Sidebar />
      <main className="arc-page">
        {arc ? (
          <ArcView key={arc.id} arc={arc} />
        ) : (
          <div className="not-found">
            <h1>Arc not found</h1>
            <p>It may have been deleted.</p>
            <Link className="btn primary" to="/">
              Back to the board
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}

function ArcView({ arc }: { arc: Arc }) {
  const beats = useStory((s) => s.beats)
  const updateArc = useStory((s) => s.updateArc)
  const deleteArc = useStory((s) => s.deleteArc)
  const moveArcBeat = useStory((s) => s.moveArcBeat)
  const placeOutlineStep = useStory((s) => s.placeOutlineStep)
  const { back } = useBack()
  const lookup = useMentionLookup()
  const [showColors, setShowColors] = useState(false)
  // The outline's step being dragged to another beat.
  const [movingStep, setMovingStep] = useState<string | null>(null)
  const outline = outlineKind(arc.outline?.kind)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const placed = arc.beatIds.filter((id) => beats[id]?.chapterId).length
  const unplaced = arc.beatIds.length - placed
  const words = useStory((s) => outlineWords(s).byArc[arc.id] ?? 0)

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setMovingStep(null)
    const step = active.data.current as StepDragData | undefined
    if (step?.type === 'step') {
      if (over) placeOutlineStep(arc.id, step.stepId, over.id === STEP_TRAY ? null : String(over.id))
      return
    }
    if (!over || active.id === over.id) return
    moveArcBeat(arc.id, arc.beatIds.indexOf(String(active.id)), arc.beatIds.indexOf(String(over.id)))
  }

  const remove = async () => {
    const n = arc.beatIds.length
    const ok = await askConfirm({
      title: `Delete the arc “${plainText(arc.name, lookup) || 'Untitled arc'}”?`,
      message: n ? `This also deletes its ${n} beat${n === 1 ? '' : 's'}, including any placed in chapters.` : undefined,
      confirmLabel: 'Delete arc',
      danger: true,
    })
    // Back first: it goes once its page has (so the page isn't seen without it).
    if (ok) back(() => deleteArc(arc.id))
  }

  return (
    <div className={`arc-view${outline ? ' with-outline' : ''}`} style={{ '--arc': arc.color } as React.CSSProperties}>
      <BackLink />
      <header className="arc-hero">
        <div className="arc-hero-row">
          <button
            className="arc-color-btn"
            onClick={() => setShowColors((v) => !v)}
            title="Change color"
            aria-label="Change arc color"
            aria-expanded={showColors}
          >
            <span className="arc-dot big" />
            <ChevronDown size={14} />
          </button>
          <MentionTextarea
            className="arc-name-input"
            value={arc.name}
            placeholder="Untitled arc"
            aria-label="Arc name"
            submitOnEnter
            onChange={(name) => updateArc(arc.id, { name })}
          />
          <button className="icon-btn danger" onClick={remove} title="Delete arc" aria-label="Delete arc">
            <Trash2 size={18} />
          </button>
        </div>
        {showColors && (
          <div className="arc-colors">
            <ColorPicker value={arc.color} onChange={(color) => updateArc(arc.id, { color })} label="Arc colour" />
          </div>
        )}
        <MentionTextarea
          className="arc-desc-input"
          value={arc.description}
          placeholder="What is this arc about?"
          aria-label="Arc description"
          onChange={(description) => updateArc(arc.id, { description })}
        />
        <ArcCast arc={arc} />
        <p className="arc-stats">
          {arc.beatIds.length} beat{arc.beatIds.length === 1 ? '' : 's'} · {placed} in chapters
          {unplaced > 0 && (
            <>
              {' · '}
              <span className="unplaced-stat">
                <CircleDashed size={13} /> {unplaced} not placed yet
              </span>
            </>
          )}
          {' · '}
          <span title="Words in this arc and its beats, counted in the outline">
            {words.toLocaleString()} word{words === 1 ? '' : 's'}
          </span>
        </p>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={arcCollisions}
        modifiers={[arcModifier]}
        onDragStart={({ active }) => {
          const step = active.data.current as StepDragData | undefined
          if (step?.type === 'step') setMovingStep(step.stepId)
        }}
        onDragEnd={onDragEnd}
        onDragCancel={() => setMovingStep(null)}
      >
        <OutlineBar arc={arc} dragging={!!movingStep} />
        <SortableContext items={arc.beatIds} strategy={verticalListSortingStrategy}>
          <ol className={`arc-beats${movingStep ? ' moving-step' : ''}`}>
            {arc.beatIds.map((id, i) =>
              beats[id] ? <ArcBeatRow key={id} arc={arc} beat={beats[id]} index={i} withOutline={!!outline} /> : null,
            )}
          </ol>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {movingStep && outline?.steps.find((st) => st.id === movingStep) ? (
            <OutlineMarkView outline={outline} step={outline.steps.find((st) => st.id === movingStep)!} overlay />
          ) : null}
        </DragOverlay>
      </DndContext>
      {arc.beatIds.length === 0 && (
        <p className="arc-empty">No beats yet. Add the moments of this arc in the order they happen.</p>
      )}
      <ArcBeatComposer arcId={arc.id} />
    </div>
  )
}

function ArcBeatRow({ arc, beat, index, withOutline }: { arc: Arc; beat: Beat; index: number; withOutline: boolean }) {
  const chapters = useStory((s) => s.chapters)
  const placeBeat = useStory((s) => s.placeBeat)
  const openBeat = useUi((s) => s.openBeat)
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging, isOver, active } =
    useSortable({ id: beat.id, data: { type: 'beat' } })
  // An outline's step dragged over this beat.
  const stepOver = isOver && typeOf(active?.data) === 'step'
  const lookup = useMentionLookup()
  const number = beat.chapterId ? chapterNumbers(chapters)[beat.chapterId] : null
  const chapter = chapters.find((c) => c.id === beat.chapterId)

  return (
    <li
      ref={setNodeRef}
      className={`arc-beat-row${withOutline ? ' with-outline' : ''}${stepOver ? ' step-over' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className={`arc-beat${isDragging ? ' dragging' : ''}${number ? '' : ' unplaced'}`}>
        <button
          ref={setActivatorNodeRef}
          className="grip-btn"
          {...attributes}
          {...listeners}
          aria-label={`Reorder “${plainText(beat.title, lookup) || 'Untitled beat'}”`}
        >
          <GripVertical size={16} />
        </button>
        <span className="arc-beat-index">{index + 1}</span>
        <button className="arc-beat-body" onClick={() => openBeat(beat.id)}>
          <span className="beat-title">
            <MentionText text={beat.title} fallback={<span className="muted">Untitled beat</span>} />
          </span>
          {beat.description && (
            <span className="beat-desc">
              <MentionText text={beat.description} />
            </span>
          )}
        </button>
        <label
          className={`chapter-pill${number ? '' : ' unplaced'}`}
          title={number ? 'Change chapter' : 'Not in a chapter yet — choose one, or drag it onto the board'}
        >
          {number ? (
            <>
              <BookOpen size={13} />
              <span>
                Ch {number}
                {chapter?.title ? <span className="pill-sub"> · {plainText(chapter.title, lookup)}</span> : null}
              </span>
            </>
          ) : (
            <>
              <CircleDashed size={13} />
              <span>Not placed</span>
            </>
          )}
          <ChevronDown size={12} />
          <select
            value={beat.chapterId ?? ''}
            onChange={(e) => placeBeat(beat.id, e.target.value || null)}
            aria-label="Chapter"
          >
            <option value="">Not in a chapter</option>
            {chapters.map((c, i) => (
              <option key={c.id} value={c.id}>
                Chapter {i + 1}
                {c.title ? `: ${plainText(c.title, lookup)}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {withOutline && <OutlineMarks arc={arc} beatId={beat.id} />}
    </li>
  )
}

function ArcBeatComposer({ arcId }: { arcId: string }) {
  const addBeat = useStory((s) => s.addBeat)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const submit = (text = title) => {
    if (!text.trim()) return
    addBeat({ arcId, title: text.trim(), description: description.trim() })
    setTitle('')
    setDescription('')
  }

  return (
    <form
      className="arc-composer"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="arc-composer-fields">
        <MentionTextarea
          className="arc-composer-title"
          value={title}
          onChange={setTitle}
          placeholder="New beat: what happens next in this arc?"
          aria-label="New beat title"
          submitOnEnter
          onSubmit={submit}
        />
        <MentionTextarea
          className="arc-composer-details"
          value={description}
          onChange={setDescription}
          placeholder="Details (optional). Type @ to mention a character."
          aria-label="New beat details"
        />
      </div>
      <button type="submit" className="btn primary" disabled={!title.trim()}>
        <Plus size={16} /> Add beat
      </button>
    </form>
  )
}

/** The characters involved in an arc, with a picker to add more. */
function ArcCast({ arc }: { arc: Arc }) {
  const characters = useStory((s) => s.characters)
  const setArcCharacter = useStory((s) => s.setArcCharacter)
  const cast = arc.characterIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)
  const others = characters.filter((c) => !arc.characterIds.includes(c.id))

  return (
    <div className="cast">
      <span className="cast-label">Characters</span>
      {cast.map((c) => (
        <span key={c.id} className="cast-chip" style={{ '--char': c.color } as React.CSSProperties}>
          <Link to={`/characters/${c.id}`} className="cast-link">
            <CharacterAvatar character={c} size="xs" />
            {displayName(c)}
          </Link>
          <button
            className="cast-remove"
            onClick={() => setArcCharacter(arc.id, c.id, false)}
            aria-label={`Remove ${displayName(c)} from this arc`}
            title="Remove from arc"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      {others.length > 0 ? (
        <label className="cast-add">
          <UserPlus size={13} />
          <span>Add</span>
          <select
            value=""
            onChange={(e) => e.target.value && setArcCharacter(arc.id, e.target.value, true)}
            aria-label="Add a character to this arc"
          >
            <option value="">Add a character…</option>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {displayName(c)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        characters.length === 0 && <span className="cast-hint">Create characters in the sidebar’s Characters tab.</span>
      )}
    </div>
  )
}
