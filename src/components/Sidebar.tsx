import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ArrowUpRight, ChevronRight, CircleDashed, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import type { Arc, Beat } from '../types'
import { useChapterNumbers, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { nextArcColor } from '../lib/colors'
import { ChapterTag } from './ChapterTag'
import { ColorSwatches } from './ColorSwatches'
import type { BeatDragData, UnassignDropData } from '../lib/dnd'

interface Props {
  /** Beats can be dragged from the sidebar onto the chapter board. */
  dragEnabled?: boolean
  /** A board beat is being dragged; show the drop zone for taking it out of its chapter. */
  unassignActive?: boolean
}

export function Sidebar({ dragEnabled = false, unassignActive = false }: Props) {
  const arcs = useStory((s) => s.arcs)
  const open = useUi((s) => s.sidebarOpen)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const toggleArc = useUi((s) => s.toggleArc)
  const expanded = useUi((s) => s.expandedArcs)
  const dropData: UnassignDropData = { type: 'unassign' }
  const { setNodeRef, isOver } = useDroppable({
    id: 'sidebar:unassign',
    data: dropData,
    disabled: !dragEnabled || !open,
  })

  if (!open) {
    return (
      <aside className="sidebar collapsed" aria-label="Arcs">
        <button className="icon-btn" onClick={toggleSidebar} title="Show arcs" aria-label="Show arcs">
          <PanelLeftOpen size={18} />
        </button>
        <div className="rail-dots">
          {arcs.map((arc) => (
            <button
              key={arc.id}
              className="rail-dot"
              style={{ '--arc': arc.color } as React.CSSProperties}
              title={arc.name}
              aria-label={`Show arc ${arc.name}`}
              onClick={() => {
                if (!expanded[arc.id]) toggleArc(arc.id)
                toggleSidebar()
              }}
            />
          ))}
        </div>
      </aside>
    )
  }

  return (
    <aside ref={setNodeRef} className={`sidebar${unassignActive ? ' unassign-active' : ''}${isOver && unassignActive ? ' unassign-over' : ''}`} aria-label="Arcs">
      <div className="sidebar-head">
        <h2>Arcs</h2>
        <button className="icon-btn" onClick={toggleSidebar} title="Hide arcs" aria-label="Hide arcs">
          <PanelLeftClose size={18} />
        </button>
      </div>
      <div className="sidebar-scroll">
        {arcs.length === 0 && <p className="sidebar-empty">No arcs yet. Create one to start adding beats.</p>}
        {arcs.map((arc) => (
          <ArcSection key={arc.id} arc={arc} dragEnabled={dragEnabled} />
        ))}
        <NewArcForm />
      </div>
      {unassignActive && (
        <div className="unassign-zone">
          <strong>Drop here</strong>
          <span>to take the beat out of its chapter</span>
        </div>
      )}
    </aside>
  )
}

function ArcSection({ arc, dragEnabled }: { arc: Arc; dragEnabled: boolean }) {
  const beats = useStory((s) => s.beats)
  const numbers = useChapterNumbers()
  const expanded = useUi((s) => !!s.expandedArcs[arc.id])
  const toggleArc = useUi((s) => s.toggleArc)
  const setHighlight = useUi((s) => s.setHighlightArc)
  const unplaced = arc.beatIds.filter((id) => !beats[id]?.chapterId).length

  // A row can unmount while hovered (page change, arc deleted) without a
  // mouseleave; don't leave the board dimmed.
  useEffect(
    () => () => {
      if (useUi.getState().highlightArcId === arc.id) setHighlight(null)
    },
    [arc.id, setHighlight],
  )

  return (
    <section
      className={`arc-section${expanded ? ' expanded' : ''}`}
      style={{ '--arc': arc.color } as React.CSSProperties}
      onMouseEnter={() => setHighlight(arc.id)}
      onMouseLeave={() => setHighlight(null)}
    >
      <div className="arc-row">
        <button className="arc-toggle" onClick={() => toggleArc(arc.id)} aria-expanded={expanded}>
          <ChevronRight size={16} className="chevron" />
          <span className="arc-dot" />
          <span className="arc-name">{arc.name || 'Untitled arc'}</span>
          <span
            className="arc-count"
            title={`${arc.beatIds.length} beat${arc.beatIds.length === 1 ? '' : 's'}${unplaced ? `, ${unplaced} not in a chapter yet` : ''}`}
          >
            {unplaced > 0 && (
              <span className="arc-unplaced">
                <CircleDashed size={11} />
                {unplaced}
              </span>
            )}
            <span>{arc.beatIds.length}</span>
          </span>
        </button>
        <NavLink
          to={`/arcs/${arc.id}`}
          className="icon-btn"
          title={`Open ${arc.name || 'arc'} page`}
          aria-label={`Open ${arc.name || 'arc'} page`}
        >
          <ArrowUpRight size={16} />
        </NavLink>
      </div>
      {expanded && (
        <ul className="side-beats">
          {arc.beatIds.map((id) => {
            const beat = beats[id]
            if (!beat) return null
            const number = beat.chapterId ? numbers[beat.chapterId] : null
            return dragEnabled ? (
              <DraggableSideBeat key={id} beat={beat} number={number} />
            ) : (
              <SideBeat key={id} beat={beat} number={number} />
            )
          })}
          <li>
            <QuickAddBeat arcId={arc.id} />
          </li>
        </ul>
      )}
    </section>
  )
}

interface SideBeatProps {
  beat: Beat
  number: number | null
}

function SideBeat({ beat, number }: SideBeatProps) {
  const openBeat = useUi((s) => s.openBeat)
  return (
    <li>
      <button className="side-beat" onClick={() => openBeat(beat.id)}>
        <ChapterTag number={number} />
        <span className="side-beat-title">{beat.title || 'Untitled beat'}</span>
      </button>
    </li>
  )
}

function DraggableSideBeat({ beat, number }: SideBeatProps) {
  const openBeat = useUi((s) => s.openBeat)
  const data: BeatDragData = { type: 'beat', beatId: beat.id, origin: 'sidebar' }
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: `sidebar:${beat.id}`, data })
  return (
    <li>
      <div
        ref={setNodeRef}
        className={`side-beat draggable${isDragging ? ' dragging' : ''}`}
        {...attributes}
        {...listeners}
        aria-roledescription="draggable beat"
        title={number ? `Drag to move to another chapter` : 'Drag onto a chapter to place it'}
        onClick={() => openBeat(beat.id)}
        onKeyDown={(e) => {
          listeners?.onKeyDown?.(e)
          if (e.key === 'Enter' && !e.defaultPrevented) openBeat(beat.id)
        }}
      >
        <ChapterTag number={number} />
        <span className="side-beat-title">{beat.title || 'Untitled beat'}</span>
      </div>
    </li>
  )
}

function QuickAddBeat({ arcId }: { arcId: string }) {
  const addBeat = useStory((s) => s.addBeat)
  const [title, setTitle] = useState('')
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        addBeat({ arcId, title: title.trim() })
        setTitle('')
      }}
    >
      <Plus size={14} />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a beat to this arc"
        aria-label="New beat title"
      />
    </form>
  )
}

function NewArcForm() {
  const arcs = useStory((s) => s.arcs)
  const addArc = useStory((s) => s.addArc)
  const toggleArc = useUi((s) => s.toggleArc)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('')
  const suggested = nextArcColor(arcs.map((a) => a.color))
  const chosen = color || suggested

  if (!open) {
    return (
      <button className="new-arc-btn" onClick={() => setOpen(true)}>
        <Plus size={16} /> New arc
      </button>
    )
  }

  const close = () => {
    setOpen(false)
    setName('')
    setColor('')
  }

  return (
    <form
      className="new-arc-form"
      style={{ '--arc': chosen } as React.CSSProperties}
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        toggleArc(addArc({ name: name.trim(), color: chosen }))
        close()
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Arc name, e.g. “The heist”"
        aria-label="Arc name"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      />
      <ColorSwatches value={chosen} onChange={setColor} />
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={!name.trim()}>
          Create arc
        </button>
        <button type="button" className="btn ghost" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  )
}
