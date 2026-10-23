import { useState, type ReactNode } from 'react'
import { Eye, RefreshCw } from 'lucide-react'
import { Modal } from './Modal'
import { openReview, setReviewerName, useReview } from '../review/store'
import { notify } from '../store/history'
import { when } from '../lib/when'

// What an editor sees around a story shared with them for comments: the
// story opening (or not), their name to comment under, and a note in the top
// bar that they're reviewing.

/** The story, once it's open; until then, that it's opening (or why it can't). */
export function ReviewGate({ children }: { children: ReactNode }) {
  const status = useReview((s) => s.status)
  const error = useReview((s) => s.error)
  const name = useReview((s) => s.name)
  if (status === 'opening') return <div className="boot">Opening the story…</div>
  if (status !== 'open')
    return (
      <div className="review-trouble">
        <h1>Can’t open this story</h1>
        <p>{error}</p>
        {status === 'error' && (
          <button className="btn primary" onClick={() => void openReview()}>
            Try again
          </button>
        )}
      </div>
    )
  return (
    <>
      {children}
      {!name && <NameDialog first />}
    </>
  )
}

/** The editor's name, shown with their comments. */
function NameDialog({ first, onClose }: { first?: boolean; onClose?: () => void }) {
  const title = useReview((s) => s.title)
  const label = useReview((s) => s.label)
  const [name, setName] = useState(useReview.getState().name || label)
  const done = () => {
    setReviewerName(name || 'Editor')
    onClose?.()
  }
  return (
    <Modal title={first ? 'Reviewing a story' : 'Your name'} onClose={done} variant="confirm">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          done()
        }}
      >
        {first && (
          <>
            <h2 className="confirm-title">You’re invited to comment on “{title || 'Untitled story'}”</h2>
            <p className="confirm-message">
              Read all of it, and comment on anything: select words in the manuscript, or use the comment buttons on chapters, beats, arcs,
              characters, places and mind map cards. You can’t change the story itself; nothing is kept in this browser but your name.
            </p>
          </>
        )}
        <label className="field">
          <span className="field-label">Your name, shown with your comments</span>
          <input className="plain-input" autoFocus value={name} maxLength={80} placeholder="Editor" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="confirm-actions">
          <button className="btn primary">{first ? 'Start reading' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** In the top bar: reviewing, as who, and the story as of when (to get the writer's latest). */
export function ReviewBadge() {
  const name = useReview((s) => s.name)
  const savedAt = useReview((s) => s.savedAt)
  const [naming, setNaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const reload = async () => {
    setBusy(true)
    await openReview()
    setBusy(false)
    notify('The story is as the writer last saved it.')
  }
  return (
    <div className="review-badge">
      <span className="review-badge-label" title="You can read and comment, not change the story">
        <Eye size={14} aria-hidden /> Reviewing
      </span>
      <button className="link-btn" onClick={() => setNaming(true)} title="Change the name shown with your comments">
        as {name || 'Editor'}
      </button>
      <button className="icon-btn small" onClick={() => void reload()} disabled={busy} aria-label="Get the writer’s latest" title={savedAt ? `Saved by the writer ${when(savedAt)}: get their latest` : 'Get the writer’s latest'}>
        <RefreshCw size={14} />
      </button>
      {naming && <NameDialog onClose={() => setNaming(false)} />}
    </div>
  )
}
