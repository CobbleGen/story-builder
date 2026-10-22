import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, BookOpen, Network, Trash2 } from 'lucide-react'
import type { ArchivedItem } from '../types'
import { useMentionLookup, useStory } from '../store/storyStore'
import { askConfirm } from '../lib/confirm'
import { plainText } from '../lib/mentions'
import { ELEMENT_KIND_NAMES } from '../lib/elements'
import { archivedName, archivedWith } from '../lib/archived'
import { useRestore } from '../lib/useArchive'
import { notify } from '../store/history'
import { CharacterAvatar } from './CharacterAvatar'
import { ElementIcon } from './ElementIcon'

// The Archived tab of the sidebar (things put away, to bring back or delete
// for good), and archiving things from wherever they're edited.

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
const quoted = (name: string) => `“${name}”`

/** What sort of thing it is, as a word: "Chapter", "Place". */
const kindLabel = (item: ArchivedItem) =>
  item.kind === 'element'
    ? ELEMENT_KIND_NAMES[item.elements[0]?.kind ?? 'other'].one
    : item.kind === 'map'
      ? 'Mind map'
      : item.kind.charAt(0).toUpperCase() + item.kind.slice(1)

/** When it was archived, roughly: "today", "3 days ago", "on 4 March". */
function whenArchived(at: number, now = Date.now()): string {
  const day = (t: number) => Math.floor((t - new Date(t).getTimezoneOffset() * 60_000) / 86_400_000)
  const days = day(now) - day(at)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  const date = new Date(at)
  return `on ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })}`
}

function ArchivedIcon({ item, arcColor }: { item: ArchivedItem; arcColor?: string }) {
  if (item.kind === 'character' && item.characters[0]) return <CharacterAvatar character={item.characters[0]} size="sm" />
  if (item.kind === 'element' && item.elements[0]) return <ElementIcon element={item.elements[0]} size="sm" />
  if (item.kind === 'arc') return <span className="arc-dot" style={{ '--arc': item.arcs[0]?.color } as React.CSSProperties} aria-hidden />
  if (item.kind === 'beat') return <span className="archived-beat-mark" style={{ '--arc': arcColor } as React.CSSProperties} aria-hidden />
  return (
    <span className="archived-kind-icon" aria-hidden>
      {item.kind === 'map' ? <Network size={14} /> : <BookOpen size={14} />}
    </span>
  )
}

function ArchivedRow({ item }: { item: ArchivedItem }) {
  const lookup = useMentionLookup()
  const arcs = useStory((s) => s.arcs)
  const archive = useStory((s) => s.archive)
  const deleteArchived = useStory((s) => s.deleteArchived)
  const restore = useRestore()
  const name = archivedName(item, lookup)

  const beats = item.beats.length
  const words = Object.values(item.texts).reduce((n, t) => n + (t.words || 0), 0)
  const beatArcId = item.kind === 'beat' ? item.beats[0]?.arcId : undefined
  const liveArc = beatArcId ? arcs.find((a) => a.id === beatArcId) : undefined
  const archivedArc = beatArcId && !liveArc ? archive.find((a) => a.kind === 'arc' && a.arcs.some((r) => r.id === beatArcId)) : undefined
  const details = [
    kindLabel(item),
    item.kind === 'chapter' && words ? count(words, 'word') : '',
    (item.kind === 'chapter' || item.kind === 'arc') && beats ? count(beats, 'beat') : '',
    liveArc ? `in ${plainText(liveArc.name, lookup) || 'Untitled arc'}` : '',
    archivedArc ? `its arc is archived too` : '',
    item.kind === 'map' && item.mindMaps[0] ? count(item.mindMaps[0].nodes.length, 'card') : '',
  ].filter(Boolean)

  const remove = async () => {
    const what = {
      chapter: [words ? `its written text (${count(words, 'word')})` : '', beats ? `its ${count(beats, 'beat')}` : ''].filter(Boolean).join(' and '),
      arc: beats ? `its ${count(beats, 'beat')}` : '',
      beat: '',
      character: '',
      element: '',
      map: 'its cards and lines',
    }[item.kind]
    const ok = await askConfirm({
      title: `Delete ${quoted(name)} for good?`,
      message: [
        what ? `It goes with ${what}.` : '',
        item.kind === 'character' || item.kind === 'element' ? 'Where it’s mentioned, its name stays as plain text.' : '',
        item.kind === 'map' ? 'The chapters, characters and beats on it stay in your story.' : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined,
      confirmLabel: 'Delete for good',
      danger: true,
    })
    if (!ok) return
    deleteArchived(item.id)
    notify(`Deleted ${quoted(name)} for good.`)
  }

  return (
    <li className="archived-row">
      <ArchivedIcon item={item} arcColor={liveArc?.color ?? archivedArc?.arcs[0]?.color} />
      <div className="archived-text">
        <span className="archived-name">{name}</span>
        <span className="archived-meta">{details.join(' · ')}</span>
        <div className="archived-foot">
          <span className="archived-when">Archived {whenArchived(item.at)}</span>
          <div className="archived-actions">
            <button
              className="btn small"
              onClick={() => restore(item)}
              title={archivedArc ? 'Bring it back, with its arc' : 'Bring it back where it was'}
              aria-label={`Bring back ${name}`}
            >
              <ArchiveRestore size={14} /> Restore
            </button>
            <button
              className="icon-btn small danger"
              onClick={() => void remove()}
              title="Delete for good"
              aria-label={`Delete ${name} for good`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}

/** The sidebar's Archived tab: newest first. */
export function ArchivedPanel() {
  const archive = useStory((s) => s.archive)
  if (!archive.length) {
    return (
      <div className="archived-empty">
        <Archive size={22} aria-hidden />
        <p>Nothing archived.</p>
        <p className="muted">
          Archive a chapter, arc, beat, character, place or map to put it away without deleting it. It waits here, out of your
          story, until you bring it back where it was.
        </p>
      </div>
    )
  }
  return (
    <ul className="archived-list" aria-label="Archived">
      {[...archive].reverse().map((item) => (
        <ArchivedRow key={item.id} item={item} />
      ))}
    </ul>
  )
}

/**
 * In place of the page of something not in the story: if it's archived,
 * saying so, with a way to bring it back.
 */
export function NotInStory({ id, title, gone }: { id: string | undefined; title: string; gone: string }) {
  const item = useStory((s) => (id ? archivedWith(s, id) : undefined))
  const lookup = useMentionLookup()
  const restore = useRestore()
  if (item) {
    const name = archivedName(item, lookup)
    return (
      <div className="not-found">
        <Archive size={28} aria-hidden className="muted" />
        <h1>{quoted(name)} is archived</h1>
        <p>It’s out of your story for now, kept in the sidebar under Archived. Bring it back to see it here.</p>
        <div className="not-found-actions">
          <button className="btn primary" onClick={() => restore(item)}>
            <ArchiveRestore size={16} /> Bring it back
          </button>
          <Link className="btn" to="/">
            Back to the board
          </Link>
        </div>
      </div>
    )
  }
  return (
    <div className="not-found">
      <h1>{title}</h1>
      <p>{gone}</p>
      <Link className="btn primary" to="/">
        Back to the board
      </Link>
    </div>
  )
}
