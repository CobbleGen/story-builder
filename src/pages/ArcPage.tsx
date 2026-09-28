import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, BookOpen, ChevronDown, CircleDashed, GripVertical, Plus, Trash2 } from 'lucide-react'
import type { Arc, Beat } from '../types'
import { chapterNumbers, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { Sidebar } from '../components/Sidebar'
import { AutoTextarea } from '../components/AutoTextarea'
import { ColorSwatches } from '../components/ColorSwatches'

export function ArcPage() {
  const { arcId } = useParams()
  const arc = useStory((s) => s.arcs.find((a) => a.id === arcId))

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
  const navigate = useNavigate()
  const [showColors, setShowColors] = useState(false)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const placed = arc.beatIds.filter((id) => beats[id]?.chapterId).length
  const unplaced = arc.beatIds.length - placed

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    moveArcBeat(arc.id, arc.beatIds.indexOf(String(active.id)), arc.beatIds.indexOf(String(over.id)))
  }

  const remove = () => {
    const n = arc.beatIds.length
    const note = n ? `\n\nThis also deletes its ${n} beat${n === 1 ? '' : 's'}, including any placed in chapters.` : ''
    if (window.confirm(`Delete the arc “${arc.name || 'Untitled arc'}”?${note}`)) {
      deleteArc(arc.id)
      navigate('/')
    }
  }

  return (
    <div className="arc-view" style={{ '--arc': arc.color } as React.CSSProperties}>
      <Link to="/" className="back-link">
        <ArrowLeft size={16} /> Chapter board
      </Link>
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
          <AutoTextarea
            className="arc-name-input"
            value={arc.name}
            placeholder="Untitled arc"
            aria-label="Arc name"
            submitOnEnter
            onChange={(e) => updateArc(arc.id, { name: e.target.value })}
          />
          <button className="icon-btn danger" onClick={remove} title="Delete arc" aria-label="Delete arc">
            <Trash2 size={18} />
          </button>
        </div>
        {showColors && (
          <div className="arc-colors">
            <ColorSwatches value={arc.color} onChange={(color) => updateArc(arc.id, { color })} />
          </div>
        )}
        <AutoTextarea
          className="arc-desc-input"
          value={arc.description}
          placeholder="What is this arc about?"
          aria-label="Arc description"
          onChange={(e) => updateArc(arc.id, { description: e.target.value })}
        />
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
        </p>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={arc.beatIds} strategy={verticalListSortingStrategy}>
          <ol className="arc-beats">
            {arc.beatIds.map((id, i) =>
              beats[id] ? <ArcBeatRow key={id} beat={beats[id]} index={i} /> : null,
            )}
          </ol>
        </SortableContext>
      </DndContext>
      {arc.beatIds.length === 0 && (
        <p className="arc-empty">No beats yet. Add the moments of this arc in the order they happen.</p>
      )}
      <ArcBeatComposer arcId={arc.id} />
    </div>
  )
}

function ArcBeatRow({ beat, index }: { beat: Beat; index: number }) {
  const chapters = useStory((s) => s.chapters)
  const placeBeat = useStory((s) => s.placeBeat)
  const openBeat = useUi((s) => s.openBeat)
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: beat.id })
  const number = beat.chapterId ? chapterNumbers(chapters)[beat.chapterId] : null
  const chapter = chapters.find((c) => c.id === beat.chapterId)

  return (
    <li
      ref={setNodeRef}
      className={`arc-beat${isDragging ? ' dragging' : ''}${number ? '' : ' unplaced'}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        className="grip-btn"
        {...attributes}
        {...listeners}
        aria-label={`Reorder “${beat.title || 'Untitled beat'}”`}
      >
        <GripVertical size={16} />
      </button>
      <span className="arc-beat-index">{index + 1}</span>
      <button className="arc-beat-body" onClick={() => openBeat(beat.id)}>
        <span className="beat-title">{beat.title || <span className="muted">Untitled beat</span>}</span>
        {beat.description && <span className="beat-desc">{beat.description}</span>}
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
              {chapter?.title ? <span className="pill-sub"> · {chapter.title}</span> : null}
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
              {c.title ? `: ${c.title}` : ''}
            </option>
          ))}
        </select>
      </label>
    </li>
  )
}

function ArcBeatComposer({ arcId }: { arcId: string }) {
  const addBeat = useStory((s) => s.addBeat)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const submit = () => {
    if (!title.trim()) return
    addBeat({ arcId, title: title.trim(), description: description.trim() })
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
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New beat — what happens next in this arc?"
          aria-label="New beat title"
        />
        <AutoTextarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Details (optional)"
          aria-label="New beat details"
        />
      </div>
      <button type="submit" className="btn primary" disabled={!title.trim()}>
        <Plus size={16} /> Add beat
      </button>
    </form>
  )
}
