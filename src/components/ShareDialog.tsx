import { useEffect, useState } from 'react'
import { Check, Copy, Link2, Plus } from 'lucide-react'
import { Modal } from './Modal'
import { SignIn } from './Account'
import { cloud, setWriterName, useCloud, writerName } from '../cloud'
import type { ReviewLink } from '../cloud/backend'
import { reviewUrl } from '../review/mode'
import { askConfirm } from '../lib/confirm'
import { when } from '../lib/when'
import { useStory } from '../store/storyStore'

// Sharing the story open here for comments: links for editors (a friend, a
// writing group, an editor) to read it all and comment on anything in it,
// without changing it. Each link is to this story; turning one off stops it
// working (its comments stay).

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const user = useCloud((s) => s.user)
  const storyId = useCloud((s) => s.storyId)
  const off = useCloud((s) => s.status === 'off')
  const title = useStory((s) => s.title.trim() || 'Untitled story')
  return (
    <Modal title="Share for comments" onClose={onClose}>
      {user && storyId ? (
        <ReviewLinks title={title} />
      ) : (
        <>
          <h2 className="confirm-title">Share “{title}” for comments</h2>
          <p className="confirm-message">
            Give an editor a link to read the story (every draft of it) and comment on anything in it: passages of the manuscript, chapters, beats,
            arcs, characters, places and mind maps. They can’t change anything. Comments are kept in your account, so{' '}
            {off ? 'this needs a version of Story Builder with accounts.' : user ? 'first keep this story in your account (Your account → Your stories).' : 'sign in first.'}
          </p>
          {!off && !user && <SignIn />}
        </>
      )}
    </Modal>
  )
}

function ReviewLinks({ title }: { title: string }) {
  const [links, setLinks] = useState<ReviewLink[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [name, setName] = useState(writerName)
  const [made, setMade] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    cloud?.listReviewLinks().then(
      (found) => live && setLinks(found),
      (err) => {
        if (!live) return
        setLinks([])
        setError(message(err))
      },
    )
    return () => {
      live = false
    }
  }, [])

  const copy = async (link: ReviewLink) => {
    const url = reviewUrl(link.token)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(link.id)
    } catch {
      const field = document.querySelector<HTMLInputElement>(`[data-link="${link.id}"]`)
      field?.select()
      setCopied(`select:${link.id}`)
    }
  }

  const create = async () => {
    if (!cloud || busy) return
    setBusy(true)
    setError(null)
    try {
      const link = await cloud.createReviewLink(label.trim() || 'An editor')
      setMade(link.id)
      setLinks((all) => [link, ...(all ?? [])])
      setLabel('')
      void copy(link)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async (link: ReviewLink) => {
    const ok = await askConfirm({
      title: `Turn off the link for “${link.label || 'an editor'}”?`,
      message: 'It stops opening the story. The comments made with it stay. You can make a new link at any time.',
      confirmLabel: 'Turn off',
      danger: true,
    })
    if (!ok || !cloud) return
    setError(null)
    try {
      await cloud.revokeReviewLink(link.id)
      setLinks((all) => (all ?? []).filter((l) => l.id !== link.id))
    } catch (err) {
      setError(message(err))
    }
  }

  return (
    <div className="account-view share-view">
      <h2 className="confirm-title">Share “{title}” for comments</h2>
      <p className="account-small">
        Anyone with a link to “{title}” can read all of it (every draft) and comment on anything: select words in the manuscript, or comment on a
        chapter, beat, arc, character, place or mind map card. They can’t change the story. You see their comments here, counted on the buttons
        where they are.
      </p>
      <form
        className="assistant-new"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <label className="field">
          <span className="field-label">Who’s it for?</span>
          <input className="plain-input" value={label} maxLength={80} placeholder="Anna, my writing group…" onChange={(e) => setLabel(e.target.value)} />
        </label>
        <div className="account-ask-actions">
          <button className="btn primary small" disabled={busy}>
            <Plus size={15} /> {busy ? 'Making the link…' : 'Make a link'}
          </button>
        </div>
      </form>

      {links === null ? (
        <p className="account-small">Loading…</p>
      ) : links.length ? (
        <ul className="review-links">
          {links.map((l) => (
            <li key={l.id} className={made === l.id ? 'new' : ''}>
              <div className="review-link-head">
                <span className="account-story-title">
                  <Link2 size={14} aria-hidden /> {l.label || 'An editor'}
                </span>
                <span className="account-story-when">{l.lastUsedAt ? `Opened ${when(l.lastUsedAt)}` : `Made ${when(l.createdAt)}, not opened yet`}</span>
              </div>
              <div className="assistant-url">
                <input readOnly value={reviewUrl(l.token)} data-link={l.id} aria-label={`The link for ${l.label || 'an editor'}`} onFocus={(e) => e.target.select()} />
                <button className="btn small" onClick={() => void copy(l)}>
                  {copied === l.id ? <Check size={15} /> : <Copy size={15} />} {copied === l.id ? 'Copied' : 'Copy'}
                </button>
                <button className="btn ghost small" onClick={() => void turnOff(l)}>
                  Turn off
                </button>
              </div>
              {copied === `select:${l.id}` && <p className="account-small">It’s selected: press Ctrl+C (⌘C on a Mac) to copy it.</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="account-small">No links yet.</p>
      )}

      <label className="field share-name">
        <span className="field-label">Your name, as editors see it with your comments</span>
        <input
          className="plain-input"
          value={name}
          maxLength={80}
          placeholder="The writer"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setWriterName(name)}
        />
      </label>
      <p className="account-small">
        An AI assistant can comment too: connect one under ⋯ → AI assistants, and ask it to leave its notes as comments.
      </p>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
