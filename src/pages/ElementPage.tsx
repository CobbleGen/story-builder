import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronDown, Trash2 } from 'lucide-react'
import { BackLink } from '../components/BackLink'
import { useBack } from '../lib/trail'
import type { ElementKind, StoryElement } from '../types'
import { useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { askConfirm } from '../lib/confirm'
import { displayName } from '../lib/mentions'
import { ELEMENT_KIND_NAMES } from '../lib/elements'
import { placeCount } from '../lib/mentionedIn'
import { useMentionPlaces } from '../lib/useMentionPlaces'
import { Sidebar } from '../components/Sidebar'
import { MentionTextarea } from '../components/MentionTextarea'
import { ElementIcon } from '../components/ElementIcon'
import { ColorPicker } from '../components/ColorPicker'
import { KindPicker } from '../components/KindPicker'
import { AttributesEditor } from '../components/AttributesEditor'
import { MentionedIn } from '../components/MentionedIn'
import { PortraitPicker } from '../components/PortraitPicker'

const SUGGESTED_ATTRIBUTES: Record<ElementKind, string[]> = {
  place: ['Where', 'Looks like', 'Sounds and smells', 'Who’s there', 'History', 'Secret'],
  object: ['Looks like', 'Belongs to', 'Where it is', 'What it does', 'Where it came from', 'Secret'],
  group: ['Leader', 'Members', 'Wants', 'Base', 'Allies', 'Enemies', 'History'],
  other: ['Summary', 'Rules', 'History', 'Secret'],
}

const DESCRIBE: Record<ElementKind, string> = {
  place: 'What is this place like, in a sentence or two?',
  object: 'What is it, and why does it matter?',
  group: 'Who are they, and what do they want?',
  other: 'What is it, in a sentence or two?',
}

const EMPTY_ATTRIBUTES: Record<ElementKind, string> = {
  place: 'Add whatever you want to keep track of: where it is, what it looks like, who lives there.',
  object: 'Add whatever you want to keep track of: what it looks like, who has it, what it can do.',
  group: 'Add whatever you want to keep track of: who leads it, what it wants, who it’s up against.',
  other: 'Add whatever you want to keep track of: how it works, where it came from, what’s hidden.',
}

/** The page for a place, object, group or other story element. */
export function ElementPage() {
  const { elementId } = useParams()
  const element = useStory((s) => s.elements.find((e) => e.id === elementId))
  const setSidebarMode = useUi((s) => s.setSidebarMode)
  useEffect(() => setSidebarMode('world'), [setSidebarMode])

  return (
    <div className="workspace">
      <Sidebar />
      <main className="arc-page">
        {element ? (
          <ElementView key={element.id} element={element} />
        ) : (
          <div className="not-found">
            <h1>Not found</h1>
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

function ElementView({ element }: { element: StoryElement }) {
  const updateElement = useStory((s) => s.updateElement)
  const deleteElement = useStory((s) => s.deleteElement)
  const setPortrait = useStory((s) => s.setPortrait)
  const { back } = useBack()
  const [showColors, setShowColors] = useState(false)
  const places = useMentionPlaces(element.id)
  const count = placeCount(places)
  const names = ELEMENT_KIND_NAMES[element.kind]
  const name = displayName(element)

  const remove = async () => {
    const ok = await askConfirm({
      title: `Delete ${name}?`,
      message: 'Mentions of it become plain text, and it comes off any mind maps.',
      confirmLabel: `Delete ${names.noun}`,
      danger: true,
    })
    // Back first: it goes once its page has (so the page isn't seen without it).
    if (ok) back(() => deleteElement(element.id))
  }

  return (
    <div
      className="arc-view character-view element-view"
      style={{ '--arc': element.color, '--char': element.color } as React.CSSProperties}
    >
      <BackLink />
      <header className="arc-hero with-portrait">
        <PortraitPicker
          imageId={element.portrait}
          onChange={(imageId) => setPortrait(element.id, imageId)}
          shape="wide"
          noun="picture"
        />
        <div className="arc-hero-main">
        <div className="arc-hero-row">
          <button
            className="avatar-btn"
            onClick={() => setShowColors((v) => !v)}
            title="Change color"
            aria-label="Change color"
            aria-expanded={showColors}
          >
            <ElementIcon element={element} size="lg" portrait={false} />
            <ChevronDown size={14} />
          </button>
          <MentionTextarea
            plain
            className="arc-name-input"
            value={element.name}
            placeholder="Name"
            aria-label="Name"
            submitOnEnter
            onChange={(value) => updateElement(element.id, { name: value })}
          />
          <button className="icon-btn danger" onClick={remove} title={`Delete ${names.noun}`} aria-label={`Delete ${names.noun}`}>
            <Trash2 size={18} />
          </button>
        </div>
        {showColors && (
          <div className="arc-colors character-colors">
            <ColorPicker value={element.color} onChange={(color) => updateElement(element.id, { color })} label="Colour" />
          </div>
        )}
        <div className="element-kind-row">
          <KindPicker value={element.kind} onChange={(kind) => updateElement(element.id, { kind })} />
        </div>
        <MentionTextarea
          className="arc-desc-input"
          value={element.description}
          placeholder={DESCRIBE[element.kind]}
          aria-label="Description"
          onChange={(description) => updateElement(element.id, { description })}
        />
        <p className="arc-stats">
          Mentioned in {count} place{count === 1 ? '' : 's'}
        </p>
        </div>
      </header>

      <AttributesEditor
        ownerId={element.id}
        attributes={element.attributes}
        suggestions={SUGGESTED_ATTRIBUTES[element.kind]}
        emptyText={EMPTY_ATTRIBUTES[element.kind]}
      />
      <MentionedIn
        id={element.id}
        places={places}
        emptyText={`Type @${name} in any beat, chapter, arc or note and it will show up here.`}
      />
    </div>
  )
}
