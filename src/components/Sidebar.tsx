import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ArrowUpRight, ChevronRight, CircleDashed, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import type { Arc, Beat, Character, ElementKind, StoryElement } from '../types'
import { useChapterNumbers, useMentionLookup, useStory } from '../store/storyStore'
import { useUi, type SidebarMode } from '../store/uiStore'
import { nextArcColor } from '../lib/colors'
import { displayName, mentions, plainText } from '../lib/mentions'
import { ELEMENT_KIND_NAMES } from '../lib/elements'
import { ELEMENT_KINDS } from '../store/storyOps'
import { useScrollMemory } from '../lib/trail'
import type { BeatDragData, UnassignDropData } from '../lib/dnd'
import { ChapterTag } from './ChapterTag'
import { ColorPicker } from './ColorPicker'
import { MentionText } from './MentionText'
import { MentionTextarea } from './MentionTextarea'
import { CharacterAvatar } from './CharacterAvatar'
import { ElementIcon } from './ElementIcon'
import { KindPicker } from './KindPicker'

interface Props {
  /** Beats can be dragged from the sidebar onto the chapter board. */
  dragEnabled?: boolean
  /** A board beat is being dragged; show the drop zone for taking it out of its chapter. */
  unassignActive?: boolean
}

const MODES: { mode: SidebarMode; label: string; title: string }[] = [
  { mode: 'arcs', label: 'Arcs', title: 'Arcs and their beats' },
  { mode: 'characters', label: 'Characters', title: 'Characters' },
  { mode: 'world', label: 'World', title: 'Places, objects, groups and more' },
]

export function Sidebar({ dragEnabled = false, unassignActive = false }: Props) {
  const arcs = useStory((s) => s.arcs)
  const characters = useStory((s) => s.characters)
  const elements = useStory((s) => s.elements)
  const open = useUi((s) => s.sidebarOpen)
  const mode = useUi((s) => s.sidebarMode)
  const setMode = useUi((s) => s.setSidebarMode)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const toggleArc = useUi((s) => s.toggleArc)
  const expanded = useUi((s) => s.expandedArcs)
  const navigate = useNavigate()
  const lookup = useMentionLookup()
  const keepScroll = useScrollMemory(`sidebar ${mode}`)
  const dropData: UnassignDropData = { type: 'unassign' }
  const { setNodeRef, isOver } = useDroppable({
    id: 'sidebar:unassign',
    data: dropData,
    disabled: !dragEnabled || !open,
  })

  if (!open) {
    const label = MODES.find((m) => m.mode === mode)?.label ?? 'Arcs'
    return (
      <aside className="sidebar collapsed" aria-label={label}>
        <button className="icon-btn" onClick={toggleSidebar} title="Show sidebar" aria-label="Show sidebar">
          <PanelLeftOpen size={18} />
        </button>
        <div className="rail-dots">
          {mode === 'arcs' &&
            arcs.map((arc) => (
              <button
                key={arc.id}
                className="rail-dot"
                style={{ '--arc': arc.color } as React.CSSProperties}
                title={plainText(arc.name, lookup)}
                aria-label={`Show arc ${plainText(arc.name, lookup)}`}
                onClick={() => {
                  if (!expanded[arc.id]) toggleArc(arc.id)
                  toggleSidebar()
                }}
              />
            ))}
          {mode === 'characters' &&
            characters.map((c) => (
              <button
                key={c.id}
                className="rail-dot round"
                style={{ '--arc': c.color } as React.CSSProperties}
                title={displayName(c)}
                aria-label={`Open ${displayName(c)}`}
                onClick={() => navigate(`/characters/${c.id}`)}
              />
            ))}
          {mode === 'world' &&
            elements.map((e) => (
              <button
                key={e.id}
                className="rail-dot square"
                style={{ '--arc': e.color } as React.CSSProperties}
                title={displayName(e)}
                aria-label={`Open ${displayName(e)}`}
                onClick={() => navigate(`/elements/${e.id}`)}
              />
            ))}
        </div>
      </aside>
    )
  }

  return (
    <aside
      ref={setNodeRef}
      className={`sidebar${unassignActive ? ' unassign-active' : ''}${isOver && unassignActive ? ' unassign-over' : ''}`}
      aria-label="Sidebar"
    >
      <div className="sidebar-head">
        <div className="mode-switch" role="tablist" aria-label="Sidebar">
          {MODES.map((m) => (
            <button
              key={m.mode}
              role="tab"
              aria-selected={mode === m.mode}
              className={`mode-tab${mode === m.mode ? ' active' : ''}`}
              title={m.title}
              onClick={() => setMode(m.mode)}
            >
              {m.label}
              <span className="mode-count">
                {m.mode === 'arcs' ? arcs.length : m.mode === 'characters' ? characters.length : elements.length}
              </span>
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={toggleSidebar} title="Hide sidebar" aria-label="Hide sidebar">
          <PanelLeftClose size={18} />
        </button>
      </div>
      <div ref={keepScroll} className="sidebar-scroll" role="tabpanel">
        {mode === 'arcs' ? (
          <>
            {arcs.length === 0 && <p className="sidebar-empty">No arcs yet. Create one to start adding beats.</p>}
            {arcs.map((arc) => (
              <ArcSection key={arc.id} arc={arc} dragEnabled={dragEnabled} />
            ))}
            <NewArcForm />
          </>
        ) : mode === 'characters' ? (
          <>
            {characters.length === 0 && (
              <p className="sidebar-empty">No characters yet. Add one here, or type @ and a new name in any text.</p>
            )}
            {characters.map((c) => (
              <CharacterRow key={c.id} character={c} />
            ))}
            <NewCharacterForm />
          </>
        ) : (
          <>
            {elements.length === 0 && (
              <p className="sidebar-empty">
                The places, objects and groups in your story, and anything else worth keeping track of. Add one here, or
                type @ and a new name in any text.
              </p>
            )}
            {ELEMENT_KINDS.map((kind) => {
              const list = elements.filter((e) => e.kind === kind)
              if (!list.length) return null
              return (
                <section key={kind} className="world-group" aria-label={ELEMENT_KIND_NAMES[kind].many}>
                  <h3 className="world-group-head">{ELEMENT_KIND_NAMES[kind].many}</h3>
                  {list.map((e) => (
                    <ElementRow key={e.id} element={e} />
                  ))}
                </section>
              )
            })}
            <NewElementForm />
          </>
        )}
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

/** On phones the sidebar covers the page, so close it after following a link. */
function closeOnPhone() {
  const ui = useUi.getState()
  if (window.innerWidth <= 760 && ui.sidebarOpen) ui.toggleSidebar()
}

/** Clears the board highlight if the hovered row unmounts without a mouseleave. */
function useHighlightCleanup(id: string) {
  const setHighlight = useUi((s) => s.setHighlight)
  useEffect(
    () => () => {
      if (useUi.getState().highlight?.id === id) setHighlight(null)
    },
    [id, setHighlight],
  )
  return setHighlight
}

function ArcSection({ arc, dragEnabled }: { arc: Arc; dragEnabled: boolean }) {
  const beats = useStory((s) => s.beats)
  const numbers = useChapterNumbers()
  const expanded = useUi((s) => !!s.expandedArcs[arc.id])
  const toggleArc = useUi((s) => s.toggleArc)
  const setHighlight = useHighlightCleanup(arc.id)
  const navigate = useNavigate()
  const unplaced = arc.beatIds.filter((id) => !beats[id]?.chapterId).length

  return (
    <section
      className={`arc-section${expanded ? ' expanded' : ''}`}
      style={{ '--arc': arc.color } as React.CSSProperties}
      onMouseEnter={() => setHighlight({ kind: 'arc', id: arc.id })}
      onMouseLeave={() => setHighlight(null)}
    >
      <div className="arc-row">
        <button
          className="arc-toggle"
          // A click opens or closes its beats; a double-click opens the arc (leaving them as they were).
          onClick={(e) => {
            if (e.detail < 2) toggleArc(arc.id)
          }}
          onDoubleClick={() => {
            toggleArc(arc.id)
            closeOnPhone()
            navigate(`/arcs/${arc.id}`)
          }}
          aria-expanded={expanded}
          title="Click to show its beats, double-click to open the arc"
        >
          <ChevronRight size={16} className="chevron" />
          <span className="arc-dot" />
          <span className="arc-name">
            <MentionText text={arc.name} fallback="Untitled arc" />
          </span>
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
          title="Open arc page"
          aria-label="Open arc page"
          onClick={closeOnPhone}
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
        <span className="side-beat-title">
          <MentionText text={beat.title} fallback="Untitled beat" />
        </span>
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
        title={number ? 'Drag to move to another chapter' : 'Drag onto a chapter to place it'}
        onClick={() => openBeat(beat.id)}
        onKeyDown={(e) => {
          listeners?.onKeyDown?.(e)
          if (e.key === 'Enter' && !e.defaultPrevented) openBeat(beat.id)
        }}
      >
        <ChapterTag number={number} />
        <span className="side-beat-title">
          <MentionText text={beat.title} fallback="Untitled beat" />
        </span>
      </div>
    </li>
  )
}

function QuickAddBeat({ arcId }: { arcId: string }) {
  const addBeat = useStory((s) => s.addBeat)
  const [title, setTitle] = useState('')
  const submit = (text = title) => {
    if (!text.trim()) return
    addBeat({ arcId, title: text.trim() })
    setTitle('')
  }
  return (
    <div className="quick-add">
      <Plus size={14} />
      <MentionTextarea
        className="quick-add-input"
        value={title}
        onChange={setTitle}
        placeholder="Add a beat to this arc"
        aria-label="New beat title"
        submitOnEnter
        onSubmit={submit}
      />
    </div>
  )
}

function NewArcForm() {
  const arcs = useStory((s) => s.arcs)
  const addArc = useStory((s) => s.addArc)
  const toggleArc = useUi((s) => s.toggleArc)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('')
  const chosen = color || nextArcColor(arcs.map((a) => a.color))

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
  const submit = (text = name) => {
    if (!text.trim()) return
    toggleArc(addArc({ name: text.trim(), color: chosen }))
    close()
  }

  return (
    <form
      className="new-arc-form"
      style={{ '--arc': chosen } as React.CSSProperties}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <MentionTextarea
        autoFocus
        className="field-input"
        value={name}
        onChange={setName}
        placeholder="Arc name, e.g. “The heist”"
        aria-label="Arc name"
        submitOnEnter
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            close()
          }
        }}
      />
      <ColorPicker value={chosen} onChange={setColor} label="Arc colour" />
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

function CharacterRow({ character }: { character: Character }) {
  const arcs = useStory((s) => s.arcs)
  const chapters = useStory((s) => s.chapters)
  const setHighlight = useHighlightCleanup(character.id)
  const arcCount = arcs.filter((a) => a.characterIds.includes(character.id)).length
  const povCount = chapters.filter((c) => c.povCharacterId === character.id).length
  const meta = [povCount ? `${povCount} POV` : '', arcCount ? `${arcCount} arc${arcCount === 1 ? '' : 's'}` : '']
    .filter(Boolean)
    .join(' · ')

  return (
    <NavLink
      to={`/characters/${character.id}`}
      className="character-row"
      style={{ '--char': character.color } as React.CSSProperties}
      onMouseEnter={() => setHighlight({ kind: 'character', id: character.id })}
      onMouseLeave={() => setHighlight(null)}
      onClick={closeOnPhone}
    >
      <CharacterAvatar character={character} />
      <span className="character-row-name">{displayName(character)}</span>
      {meta && <span className="character-row-meta">{meta}</span>}
    </NavLink>
  )
}

function NewCharacterForm() {
  const characters = useStory((s) => s.characters)
  const addCharacter = useStory((s) => s.addCharacter)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('')
  const chosen = color || nextArcColor(characters.map((c) => c.color))

  if (!open) {
    return (
      <button className="new-arc-btn" onClick={() => setOpen(true)}>
        <Plus size={16} /> New character
      </button>
    )
  }

  const close = () => {
    setOpen(false)
    setName('')
    setColor('')
  }
  const submit = () => {
    if (!name.trim()) return
    const id = addCharacter({ name: name.trim(), color: chosen })
    close()
    closeOnPhone()
    navigate(`/characters/${id}`)
  }

  return (
    <form
      className="new-arc-form"
      style={{ '--arc': chosen } as React.CSSProperties}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <input
        autoFocus
        className="plain-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        aria-label="Character name"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      />
      <ColorPicker value={chosen} onChange={setColor} label="Character colour" />
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={!name.trim()}>
          Create character
        </button>
        <button type="button" className="btn ghost" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function ElementRow({ element }: { element: StoryElement }) {
  const beats = useStory((s) => s.beats)
  const setHighlight = useHighlightCleanup(element.id)
  const inBeats = Object.values(beats).filter((b) => mentions(b.title, element.id) || mentions(b.description, element.id)).length

  return (
    <NavLink
      to={`/elements/${element.id}`}
      className="character-row"
      style={{ '--char': element.color } as React.CSSProperties}
      onMouseEnter={() => setHighlight({ kind: 'element', id: element.id })}
      onMouseLeave={() => setHighlight(null)}
      onClick={closeOnPhone}
    >
      <ElementIcon element={element} />
      <span className="character-row-name">{displayName(element)}</span>
      {inBeats > 0 && (
        <span className="character-row-meta">
          {inBeats} beat{inBeats === 1 ? '' : 's'}
        </span>
      )}
    </NavLink>
  )
}

function NewElementForm() {
  const elements = useStory((s) => s.elements)
  const addElement = useStory((s) => s.addElement)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ElementKind>('place')
  const [color, setColor] = useState('')
  const chosen = color || nextArcColor(elements.map((e) => e.color))

  if (!open) {
    return (
      <button className="new-arc-btn" onClick={() => setOpen(true)}>
        <Plus size={16} /> New place or thing
      </button>
    )
  }

  const close = () => {
    setOpen(false)
    setName('')
    setColor('')
  }
  const submit = () => {
    if (!name.trim()) return
    const id = addElement({ name: name.trim(), kind, color: chosen })
    close()
    closeOnPhone()
    navigate(`/elements/${id}`)
  }

  return (
    <form
      className="new-arc-form"
      style={{ '--arc': chosen } as React.CSSProperties}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <input
        autoFocus
        className="plain-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`Name, e.g. “${EXAMPLES[kind]}”`}
        aria-label="Name"
        onKeyDown={(e) => e.key === 'Escape' && close()}
      />
      <KindPicker value={kind} onChange={setKind} />
      <ColorPicker value={chosen} onChange={setColor} label="Colour" />
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={!name.trim()}>
          Create {ELEMENT_KIND_NAMES[kind].noun}
        </button>
        <button type="button" className="btn ghost" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  )
}

const EXAMPLES: Record<ElementKind, string> = {
  place: 'The lighthouse',
  object: 'The silver key',
  group: 'The Night Watch',
  other: 'The prophecy',
}
