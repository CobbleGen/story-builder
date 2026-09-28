import { useEffect, useState } from 'react'
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
import { ArrowLeft, BookOpen, ChevronDown, CircleDashed, GripVertical, Plus, Trash2, UserPlus, X } from 'lucide-react'
import type { Arc, Beat } from '../types'
import { chapterNumbers, useCharacterLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { Sidebar } from '../components/Sidebar'
import { MentionTextarea } from '../components/MentionTextarea'
import { MentionText } from '../components/MentionText'
import { CharacterAvatar } from '../components/CharacterAvatar'
import { displayName, plainText } from '../lib/mentions'
import { ColorSwatches } from '../components/ColorSwatches'
import { askConfirm } from '../lib/confirm'

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
  const navigate = useNavigate()
  const lookup = useCharacterLookup()
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

  const remove = async () => {
    const n = arc.beatIds.length
    const ok = await askConfirm({
      title: `Delete the arc “${plainText(arc.name, lookup) || 'Untitled arc'}”?`,
      message: n ? `This also deletes its ${n} beat${n === 1 ? '' : 's'}, including any placed in chapters.` : undefined,
      confirmLabel: 'Delete arc',
      danger: true,
    })
    if (ok) {
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
            <ColorSwatches value={arc.color} onChange={(color) => updateArc(arc.id, { color })} />
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
  const lookup = useCharacterLookup()
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
