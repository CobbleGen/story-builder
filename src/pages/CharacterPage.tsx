import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, Plus, Trash2, X } from 'lucide-react'
import { BackLink } from '../components/BackLink'
import { useBack } from '../lib/trail'
import type { Character } from '../types'
import { chapterNumbers, useMentionLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { askConfirm } from '../lib/confirm'
import { displayName, plainText } from '../lib/mentions'
import { placeCount } from '../lib/mentionedIn'
import { useMentionPlaces } from '../lib/useMentionPlaces'
import { Sidebar } from '../components/Sidebar'
import { MentionTextarea } from '../components/MentionTextarea'
import { MentionText } from '../components/MentionText'
import { CharacterAvatar } from '../components/CharacterAvatar'
import { ColorPicker } from '../components/ColorPicker'
import { ChapterTag } from '../components/ChapterTag'
import { AttributesEditor } from '../components/AttributesEditor'
import { MentionedIn } from '../components/MentionedIn'
import { PortraitPicker } from '../components/PortraitPicker'

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
  const updateCharacter = useStory((s) => s.updateCharacter)
  const deleteCharacter = useStory((s) => s.deleteCharacter)
  const setPortrait = useStory((s) => s.setPortrait)
  const { back } = useBack()
  const [showColors, setShowColors] = useState(false)
  const name = displayName(character)
  const places = useMentionPlaces(character.id)

  const povChapters = chapters.filter((c) => c.povCharacterId === character.id)
  const characterArcs = arcs.filter((a) => a.characterIds.includes(character.id))
  const mentionCount = placeCount(places)

  const remove = async () => {
    const ok = await askConfirm({
      title: `Delete ${name}?`,
      message: 'Mentions of them become plain text, and they’re removed from arcs and chapter POVs.',
      confirmLabel: 'Delete character',
      danger: true,
    })
    // Back first: it goes once its page has (so the page isn't seen without it).
    if (ok) back(() => deleteCharacter(character.id))
  }

  const stats = [
    `POV in ${povChapters.length} chapter${povChapters.length === 1 ? '' : 's'}`,
    `in ${characterArcs.length} arc${characterArcs.length === 1 ? '' : 's'}`,
    `mentioned in ${mentionCount} place${mentionCount === 1 ? '' : 's'}`,
  ]

  return (
    <div className="arc-view character-view" style={{ '--arc': character.color, '--char': character.color } as React.CSSProperties}>
      <BackLink />
      <header className="arc-hero with-portrait">
        <PortraitPicker
          imageId={character.portrait}
          onChange={(imageId) => setPortrait(character.id, imageId)}
          shape="tall"
          noun="portrait"
        />
        <div className="arc-hero-main">
        <div className="arc-hero-row">
          <button
            className="avatar-btn"
            onClick={() => setShowColors((v) => !v)}
            title="Change color"
            aria-label="Change character color"
            aria-expanded={showColors}
          >
            <CharacterAvatar character={character} size="lg" portrait={false} />
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
            <ColorPicker value={character.color} onChange={(color) => updateCharacter(character.id, { color })} label="Character colour" />
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
        </div>
      </header>

      <AttributesEditor
        ownerId={character.id}
        attributes={character.attributes}
        suggestions={SUGGESTED_ATTRIBUTES}
        emptyText="Add whatever you want to keep track of: age, looks, what they want, what they hide."
      />
      <CharacterArcs character={character} />
      <PovChapters character={character} />
      <MentionedIn
        id={character.id}
        places={places}
        emptyText={`Type @${name} in any beat, chapter, arc or note and it will show up here.`}
      />
    </div>
  )
}

function CharacterArcs({ character }: { character: Character }) {
  const arcs = useStory((s) => s.arcs)
  const setArcCharacter = useStory((s) => s.setArcCharacter)
  const lookup = useMentionLookup()
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
