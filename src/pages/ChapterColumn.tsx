import { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeftToLine, ArrowRightToLine, GripHorizontal, Plus, Trash2, X } from 'lucide-react'
import type { Chapter } from '../types'
import { useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { AutoTextarea } from '../components/AutoTextarea'
import { ArcPicker } from '../components/ArcPicker'
import { BeatCardView, DraggableBeatCard } from '../components/BeatCard'
import { Menu } from '../components/Menu'
import { chapterSortId, type ChapterDragData } from '../lib/dnd'

interface Props {
  chapter: Chapter
  number: number
  index: number
  /** Beat order to render, which differs from the store while a beat is dragged. */
  beatIds: string[]
  activeBeatId: string | null
  /** A beat is being dragged over this chapter. */
  isDropTarget: boolean
  autoFocus?: boolean
  onFocused?: () => void
  onInsertChapter: (index: number) => void
}

export function ChapterColumn({
  chapter,
  number,
  index,
  beatIds,
  activeBeatId,
  isDropTarget,
  autoFocus,
  onFocused,
  onInsertChapter,
}: Props) {
  const updateChapter = useStory((s) => s.updateChapter)
  const deleteChapter = useStory((s) => s.deleteChapter)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const data: ChapterDragData = { type: 'chapter', chapterId: chapter.id }
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: chapterSortId(chapter.id), data })

  useEffect(() => {
    if (!autoFocus) return
    titleRef.current?.focus()
    titleRef.current?.closest('.chapter')?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
    onFocused?.()
  }, [autoFocus, onFocused])

  const remove = () => {
    const count = chapter.beatIds.length
    const label = chapter.title ? `“${chapter.title}”` : `Chapter ${number}`
    const note = count ? `\n\nIts ${count} beat${count === 1 ? '' : 's'} will stay on their arcs, unplaced.` : ''
    if (window.confirm(`Delete ${label}?${note}`)) deleteChapter(chapter.id)
  }

  return (
    <section
      ref={setNodeRef}
      className={`chapter${isDragging ? ' placeholder' : ''}${isDropTarget ? ' drop-target' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={`Chapter ${number}`}
    >
      <header className="chapter-head">
        <div className="chapter-top">
          <button
            ref={setActivatorNodeRef}
            className="chapter-handle"
            {...attributes}
            {...listeners}
            aria-roledescription="draggable chapter"
            aria-label={`Chapter ${number}. Drag to reorder.`}
          >
            <span className="chapter-number">Chapter {number}</span>
            <GripHorizontal size={16} className="grip" />
          </button>
          <Menu
            label="Chapter options"
            items={[
              { label: 'Insert chapter before', icon: <ArrowLeftToLine size={16} />, onSelect: () => onInsertChapter(index) },
              { label: 'Insert chapter after', icon: <ArrowRightToLine size={16} />, onSelect: () => onInsertChapter(index + 1) },
              { label: 'Delete chapter', icon: <Trash2 size={16} />, onSelect: remove, danger: true },
            ]}
          />
        </div>
        <AutoTextarea
          ref={titleRef}
          className="chapter-title"
          value={chapter.title}
          placeholder="Untitled chapter"
          aria-label={`Chapter ${number} title`}
          submitOnEnter
          onChange={(e) => updateChapter(chapter.id, { title: e.target.value })}
        />
        <AutoTextarea
          className="chapter-summary"
          value={chapter.summary}
          placeholder="What happens in this chapter?"
          aria-label={`Chapter ${number} summary`}
          onChange={(e) => updateChapter(chapter.id, { summary: e.target.value })}
        />
      </header>
      <div className="chapter-beats" data-chapter-list={chapter.id}>
        {beatIds.map((id) => (
          <DraggableBeatCard key={id} beatId={id} activeBeatId={activeBeatId} />
        ))}
        {beatIds.length === 0 && <div className="chapter-empty">Drag beats here</div>}
      </div>
      <BeatComposer chapterId={chapter.id} />
    </section>
  )
}

/** Read-only chapter shown under the pointer while a chapter is dragged. */
export function ChapterOverlay({ chapter, number }: { chapter: Chapter; number: number }) {
  const beats = useStory((s) => s.beats)
  const arcs = useStory((s) => s.arcs)
  return (
    <section className="chapter overlay">
      <header className="chapter-head">
        <div className="chapter-top">
          <div className="chapter-handle">
            <span className="chapter-number">Chapter {number}</span>
            <GripHorizontal size={16} className="grip" />
          </div>
        </div>
        <div className="chapter-title static">{chapter.title || <span className="muted">Untitled chapter</span>}</div>
        {chapter.summary && <div className="chapter-summary static">{chapter.summary}</div>}
      </header>
      <div className="chapter-beats">
        {chapter.beatIds.map((id) =>
          beats[id] ? (
            <BeatCardView key={id} beat={beats[id]} arc={arcs.find((a) => a.id === beats[id].arcId)} />
          ) : null,
        )}
      </div>
    </section>
  )
}

function BeatComposer({ chapterId }: { chapterId: string }) {
  const arcs = useStory((s) => s.arcs)
  const addBeat = useStory((s) => s.addBeat)
  const lastArcId = useUi((s) => s.lastArcId)
  const setLastArcId = useUi((s) => s.setLastArcId)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const arcId = arcs.some((a) => a.id === lastArcId) ? lastArcId : (arcs[0]?.id ?? null)

  if (!open) {
    return (
      <button className="add-beat" onClick={() => setOpen(true)}>
        <Plus size={16} /> Add a beat
      </button>
    )
  }

  if (!arcId) {
    return (
      <div className="composer">
        <p className="composer-note">Beats belong to an arc. Create an arc first.</p>
        <div className="form-actions">
          {!sidebarOpen && (
            <button className="btn primary" onClick={toggleSidebar}>
              Show arcs
            </button>
          )}
          <button className="btn ghost" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    )
  }

  const submit = () => {
    if (!title.trim()) return
    addBeat({ arcId, title: title.trim(), chapterId })
    setTitle('')
  }
  const close = () => {
    setOpen(false)
    setTitle('')
  }

  return (
    <form
      className="composer"
      style={{ '--arc': arcs.find((a) => a.id === arcId)?.color } as React.CSSProperties}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <AutoTextarea
        autoFocus
        className="composer-input"
        value={title}
        placeholder="What happens?"
        aria-label="New beat"
        submitOnEnter
        onSubmit={submit}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            close()
          }
        }}
      />
      <ArcPicker arcs={arcs} value={arcId} onChange={setLastArcId} compact />
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={!title.trim()}>
          Add beat
        </button>
        <button type="button" className="icon-btn" onClick={close} aria-label="Cancel">
          <X size={18} />
        </button>
      </div>
    </form>
  )
}
