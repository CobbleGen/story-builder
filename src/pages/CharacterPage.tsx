import { useEffect, useRef, useState } from 'react'
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
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, ArrowUpRight, ChevronDown, GripVertical, Plus, Trash2, X } from 'lucide-react'
import type { Character, CharacterAttribute } from '../types'
import { chapterNumbers, useCharacterLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { askConfirm } from '../lib/confirm'
import { displayName, mentions, plainText } from '../lib/mentions'
import { Sidebar } from '../components/Sidebar'
import { MentionTextarea } from '../components/MentionTextarea'
import { MentionText } from '../components/MentionText'
import { CharacterAvatar } from '../components/CharacterAvatar'
import { ColorSwatches } from '../components/ColorSwatches'
import { ChapterTag } from '../components/ChapterTag'

const SUGGESTED_ATTRIBUTES = ['Age', 'Role', 'Appearance', 'Personality', 'Wants', 'Fears', 'Secret', 'Backstory']

export function CharacterPage() {
  const { characterId } = useParams()
  const character = useStory((s) => s.characters.find((c) => c.id === characterId))
  const setSidebarMode = useUi((s) => s.setSidebarMode)
  useEffect(() => setSidebarMode('characters'), [setSidebarMode])

  return (
    <div className="workspace">
      <Sidebar />
      <main className="arc-page">
        {character ? (
          <CharacterView key={character.id} character={character} />
        ) : (
          <div className="not-found">
            <h1>Character not found</h1>
            <p>They may have been deleted.</p>
            <Link className="btn primary" to="/">
              Back to the board
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}

function CharacterView({ character }: { character: Character }) {
  const chapters = useStory((s) => s.chapters)
  const arcs = useStory((s) => s.arcs)
  const beats = useStory((s) => s.beats)
  const characters = useStory((s) => s.characters)
  const updateCharacter = useStory((s) => s.updateCharacter)
  const deleteCharacter = useStory((s) => s.deleteCharacter)
  const navigate = useNavigate()
  const [showColors, setShowColors] = useState(false)
  const name = displayName(character)

  const povChapters = chapters.filter((c) => c.povCharacterId === character.id)
  const characterArcs = arcs.filter((a) => a.characterIds.includes(character.id))
  const mentionCount =
    Object.values(beats).filter((b) => mentions(b.title, character.id) || mentions(b.description, character.id)).length +
    chapters.filter((c) => mentions(c.title, character.id) || mentions(c.summary, character.id)).length +
    arcs.filter((a) => mentions(a.name, character.id) || mentions(a.description, character.id)).length +
    characters.filter(
      (c) =>
        c.id !== character.id &&
        (mentions(c.description, character.id) || c.attributes.some((a) => mentions(a.value, character.id))),
    ).length

  const remove = async () => {
    const ok = await askConfirm({
      title: `Delete ${name}?`,
      message: 'Mentions of them become plain text, and they’re removed from arcs and chapter POVs.',
      confirmLabel: 'Delete character',
      danger: true,
    })
    if (ok) {
      deleteCharacter(character.id)
      navigate('/')
    }
  }

  const stats = [
    `POV in ${povChapters.length} chapter${povChapters.length === 1 ? '' : 's'}`,
    `in ${characterArcs.length} arc${characterArcs.length === 1 ? '' : 's'}`,
    `mentioned in ${mentionCount} place${mentionCount === 1 ? '' : 's'}`,
  ]

  return (
    <div className="arc-view character-view" style={{ '--arc': character.color, '--char': character.color } as React.CSSProperties}>
      <Link to="/" className="back-link">
        <ArrowLeft size={16} /> Chapter board
      </Link>
      <header className="arc-hero">
        <div className="arc-hero-row">
          <button
            className="avatar-btn"
            onClick={() => setShowColors((v) => !v)}
            title="Change color"
            aria-label="Change character color"
            aria-expanded={showColors}
          >
            <CharacterAvatar character={character} size="lg" />
            <ChevronDown size={14} />
          </button>
          <MentionTextarea
            plain
            className="arc-name-input"
            value={character.name}
            placeholder="Name"
            aria-label="Character name"
            submitOnEnter
            onChange={(value) => updateCharacter(character.id, { name: value })}
          />
          <button className="icon-btn danger" onClick={remove} title="Delete character" aria-label="Delete character">
            <Trash2 size={18} />
          </button>
        </div>
        {showColors && (
          <div className="arc-colors character-colors">
            <ColorSwatches value={character.color} onChange={(color) => updateCharacter(character.id, { color })} />
          </div>
        )}
        <MentionTextarea
          className="arc-desc-input"
          value={character.description}
          placeholder="Who are they, in a sentence or two?"
          aria-label="Character description"
          onChange={(description) => updateCharacter(character.id, { description })}
        />
        <p className="arc-stats">{stats.join(' · ')}</p>
      </header>

      <Attributes character={character} />
      <CharacterArcs character={character} />
      <PovChapters character={character} />
      <MentionedIn character={character} />
    </div>
  )
}

function Attributes({ character }: { character: Character }) {
  const addAttribute = useStory((s) => s.addAttribute)
  const moveAttribute = useStory((s) => s.moveAttribute)
  const [focus, setFocus] = useState<{ id: string; field: 'label' | 'value' } | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const used = new Set(character.attributes.map((a) => a.label.trim().toLowerCase()))
  const suggestions = SUGGESTED_ATTRIBUTES.filter((label) => !used.has(label.toLowerCase()))
  const ids = character.attributes.map((a) => a.id)

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    moveAttribute(character.id, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
  }

  return (
    <section className="char-section">
      <h2 className="section-title">Attributes</h2>
      {character.attributes.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="attr-list">
              {character.attributes.map((attr) => (
                <AttributeRow
                  key={attr.id}
                  characterId={character.id}
                  attribute={attr}
                  focusField={focus?.id === attr.id ? focus.field : null}
                  onFocused={() => setFocus(null)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="section-empty">Add whatever you want to keep track of: age, looks, what they want, what they hide.</p>
      )}
      <div className="attr-actions">
        <button
          className="btn ghost"
          onClick={() => setFocus({ id: addAttribute(character.id), field: 'label' })}
        >
          <Plus size={16} /> Add attribute
        </button>
        {suggestions.map((label) => (
          <button
            key={label}
            className="suggestion-chip"
            onClick={() => setFocus({ id: addAttribute(character.id, { label }), field: 'value' })}
          >
            <Plus size={12} />
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}

interface AttributeRowProps {
  characterId: string
  attribute: CharacterAttribute
  focusField: 'label' | 'value' | null
  onFocused: () => void
}

function AttributeRow({ characterId, attribute, focusField, onFocused }: AttributeRowProps) {
  const updateAttribute = useStory((s) => s.updateAttribute)
  const deleteAttribute = useStory((s) => s.deleteAttribute)
  const labelRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef<HTMLTextAreaElement>(null)
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: attribute.id })

  useEffect(() => {
    if (!focusField) return
    ;(focusField === 'label' ? labelRef.current : valueRef.current)?.focus()
    onFocused()
  }, [focusField, onFocused])

  return (
    <div
      ref={setNodeRef}
      className={`attr-row${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        className="grip-btn"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${attribute.label || 'attribute'}`}
      >
        <GripVertical size={16} />
      </button>
      <input
        ref={labelRef}
        className="attr-label"
        value={attribute.label}
        placeholder="Attribute"
        aria-label="Attribute name"
        onChange={(e) => updateAttribute(characterId, attribute.id, { label: e.target.value })}
      />
      <MentionTextarea
        ref={valueRef}
        className="attr-value"
        value={attribute.value}
        placeholder="Value"
        aria-label={`${attribute.label || 'Attribute'} value`}
        onChange={(value) => updateAttribute(characterId, attribute.id, { value })}
      />
      <button
        className="icon-btn danger attr-remove"
        onClick={() => deleteAttribute(characterId, attribute.id)}
        aria-label={`Remove ${attribute.label || 'attribute'}`}
        title="Remove attribute"
      >
        <X size={16} />
      </button>
    </div>
  )
}

function CharacterArcs({ character }: { character: Character }) {
  const arcs = useStory((s) => s.arcs)
  const setArcCharacter = useStory((s) => s.setArcCharacter)
  const lookup = useCharacterLookup()
  const theirs = arcs.filter((a) => a.characterIds.includes(character.id))
  const others = arcs.filter((a) => !a.characterIds.includes(character.id))

  return (
    <section className="char-section">
      <h2 className="section-title">Arcs</h2>
      {theirs.length > 0 ? (
        <ul className="link-list">
          {theirs.map((arc) => (
            <li key={arc.id} className="link-row" style={{ '--arc': arc.color } as React.CSSProperties}>
              <Link to={`/arcs/${arc.id}`} className="link-row-main">
                <span className="arc-dot" />
                <span className="link-row-title">
                  <MentionText text={arc.name} fallback="Untitled arc" />
                </span>
                <span className="link-row-meta">
                  {arc.beatIds.length} beat{arc.beatIds.length === 1 ? '' : 's'}
                </span>
                <ArrowUpRight size={15} className="link-row-go" />
              </Link>
              <button
                className="icon-btn"
                onClick={() => setArcCharacter(arc.id, character.id, false)}
                aria-label={`Remove from ${plainText(arc.name, lookup)}`}
                title="Remove from arc"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="section-empty">Not in any arcs yet.</p>
      )}
      {others.length > 0 && (
        <label className="cast-add">
          <Plus size={13} />
          <span>Add to an arc</span>
          <select
            value=""
            onChange={(e) => e.target.value && setArcCharacter(e.target.value, character.id, true)}
            aria-label="Add to an arc"
          >
            <option value="">Add to an arc…</option>
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {plainText(a.name, lookup) || 'Untitled arc'}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  )
}

function PovChapters({ character }: { character: Character }) {
  const chapters = useStory((s) => s.chapters)
  const numbers = chapterNumbers(chapters)
  const theirs = chapters.filter((c) => c.povCharacterId === character.id)

  return (
    <section className="char-section">
      <h2 className="section-title">Point-of-view chapters</h2>
      {theirs.length > 0 ? (
        <ul className="link-list">
          {theirs.map((c) => (
            <li key={c.id} className="link-row">
              <Link to="/" className="link-row-main">
                <ChapterTag number={numbers[c.id]} />
                <span className="link-row-title">
                  <MentionText text={c.title} fallback={<span className="muted">Untitled chapter</span>} />
                </span>
                <span className="link-row-meta">
                  {c.beatIds.length} beat{c.beatIds.length === 1 ? '' : 's'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="section-empty">No chapters from their point of view yet. Pick a POV from a chapter’s header on the board.</p>
      )}
    </section>
  )
}

function MentionedIn({ character }: { character: Character }) {
  const chapters = useStory((s) => s.chapters)
  const arcs = useStory((s) => s.arcs)
  const beats = useStory((s) => s.beats)
  const characters = useStory((s) => s.characters)
  const openBeat = useUi((s) => s.openBeat)
  const numbers = chapterNumbers(chapters)
  const id = character.id

  // Beats in story order: placed ones by chapter, then the rest by arc.
  const beatList = [
    ...chapters.flatMap((c) => c.beatIds),
    ...arcs.flatMap((a) => a.beatIds.filter((b) => !beats[b]?.chapterId)),
  ]
    .map((b) => beats[b])
    .filter((b) => b && (mentions(b.title, id) || mentions(b.description, id)))
  const chapterList = chapters.filter((c) => mentions(c.title, id) || mentions(c.summary, id))
  const arcList = arcs.filter((a) => mentions(a.name, id) || mentions(a.description, id))
  const characterList = characters.filter(
    (c) => c.id !== id && (mentions(c.description, id) || c.attributes.some((a) => mentions(a.value, id))),
  )
  const empty = !beatList.length && !chapterList.length && !arcList.length && !characterList.length

  return (
    <section className="char-section">
      <h2 className="section-title">Mentioned in</h2>
      {empty ? (
        <p className="section-empty">
          Type @{displayName(character)} in any beat, chapter, arc or note and it will show up here.
        </p>
      ) : (
        <ul className="link-list">
          {beatList.map((b) => {
            const arc = arcs.find((a) => a.id === b.arcId)
            return (
              <li key={b.id} className="link-row" style={{ '--arc': arc?.color } as React.CSSProperties}>
                <button className="link-row-main" onClick={() => openBeat(b.id)}>
                  <ChapterTag number={b.chapterId ? numbers[b.chapterId] : null} />
                  <span className="link-row-title">
                    <MentionText text={b.title} fallback={<span className="muted">Untitled beat</span>} />
                    {mentions(b.description, id) && (
                      <span className="link-row-snippet">
                        <MentionText text={b.description} />
                      </span>
                    )}
                  </span>
                  <span className="link-row-kind">Beat</span>
                </button>
              </li>
            )
          })}
          {chapterList.map((c) => (
            <li key={c.id} className="link-row">
              <Link to="/" className="link-row-main">
                <ChapterTag number={numbers[c.id]} />
                <span className="link-row-title">
                  <MentionText text={c.title} fallback={<span className="muted">Untitled chapter</span>} />
                  {mentions(c.summary, id) && (
                    <span className="link-row-snippet">
                      <MentionText text={c.summary} />
                    </span>
                  )}
                </span>
                <span className="link-row-kind">Chapter</span>
              </Link>
            </li>
          ))}
          {arcList.map((a) => (
            <li key={a.id} className="link-row" style={{ '--arc': a.color } as React.CSSProperties}>
              <Link to={`/arcs/${a.id}`} className="link-row-main">
                <span className="arc-dot" />
                <span className="link-row-title">
                  <MentionText text={a.name} fallback="Untitled arc" />
                </span>
                <span className="link-row-kind">Arc</span>
              </Link>
            </li>
          ))}
          {characterList.map((c) => (
            <li key={c.id} className="link-row">
              <Link to={`/characters/${c.id}`} className="link-row-main">
                <CharacterAvatar character={c} size="xs" />
                <span className="link-row-title">
                  {displayName(c)}
                  {c.attributes
                    .filter((a) => mentions(a.value, id))
                    .map((a) => (
                      <span key={a.id} className="link-row-snippet">
                        {a.label ? `${a.label}: ` : ''}
                        <MentionText text={a.value} />
                      </span>
                    ))}
                </span>
                <span className="link-row-kind">Character</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
