import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Plus } from 'lucide-react'
import { cloud } from '../cloud'
import type { AssistantLink } from '../cloud/backend'
import { assistantUrl } from '../cloud/assistantKeys'
import { askConfirm } from '../lib/confirm'
import { when } from '../lib/when'

// Links that let an AI assistant (Claude, say) read the stories in the
// writer's account, to give feedback: made here, each shown once, and
// revoked here. The assistant reads through the story server (server/mcp.ts).

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** How to give an assistant a link. */
function HowToConnect({ url }: { url: string }) {
  return (
    <ul className="assistant-how">
      <li>
        <strong>Claude</strong> (on the web, desktop or phone): Settings → Connectors → Add custom connector. Name it Story Builder and paste the link as its URL.
      </li>
      <li>
        <strong>Claude Code</strong>: <code>claude mcp add --transport http story-builder {url}</code>
      </li>
      <li>
        <strong>Other assistants</strong>: add it as a remote MCP server.
      </li>
    </ul>
  )
}

export function AssistantLinks() {
  const [links, setLinks] = useState<AssistantLink[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [label, setLabel] = useState('Claude')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<{ link: AssistantLink; url: string } | null>(null)
  const [copied, setCopied] = useState<'yes' | 'select' | null>(null)
  const urlField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    cloud?.listAssistantLinks().then(
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

  const create = async () => {
    if (!cloud || busy) return
    setBusy(true)
    setError(null)
    try {
      const { link, key } = await cloud.createAssistantLink(label.trim() || 'AI assistant')
      setLinks((all) => [link, ...(all ?? [])])
      setMade({ link, url: assistantUrl(key) })
      setCopied(null)
      setNaming(false)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!made) return
    try {
      await navigator.clipboard.writeText(made.url)
      setCopied('yes')
    } catch {
      // No clipboard here: select it, for Ctrl+C.
      urlField.current?.select()
      setCopied('select')
    }
  }

  const revoke = async (link: AssistantLink) => {
    const ok = await askConfirm({
      title: `Revoke “${link.label || 'AI assistant'}”?`,
      message: 'An assistant using this link won’t be able to read your stories any more. You can make a new link at any time.',
      confirmLabel: 'Revoke link',
      danger: true,
    })
    if (!ok || !cloud) return
    setError(null)
    try {
      await cloud.revokeAssistantLink(link.id)
      setLinks((all) => (all ?? []).filter((l) => l.id !== link.id))
      if (made?.link.id === link.id) setMade(null)
    } catch (err) {
      setError(message(err))
    }
  }

  return (
    <section className="assistants" aria-label="AI assistants">
      <div className="account-stories-head">
        <h3 className="progress-heading">AI assistants</h3>
        {!naming && (
          <button className="btn ghost small" onClick={() => setNaming(true)}>
            <Plus size={15} /> New link
          </button>
        )}
      </div>
      <p className="account-small">
        Give an assistant such as Claude a private link to read the stories in your account (the manuscript, outline, timeline, characters,
        places and mind maps) and give you feedback. It can only read: it can’t change anything.
      </p>

      {naming && (
        <form
          className="assistant-new"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <label className="field">
            <span className="field-label">Name it, to tell your links apart</span>
            <input className="plain-input" autoFocus value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <div className="account-ask-actions">
            <button className="btn primary small" disabled={busy}>
              {busy ? 'Making the link…' : 'Make the link'}
            </button>
            <button type="button" className="btn ghost small" onClick={() => setNaming(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {made && (
        <div className="account-ask assistant-made" role="status">
          <p>
            <strong>Your link for {made.link.label || 'an AI assistant'}.</strong> Copy it now: it won’t be shown again.
          </p>
          <div className="assistant-url">
            <input ref={urlField} readOnly value={made.url} aria-label="The link" onFocus={(e) => e.target.select()} />
            <button className="btn small" onClick={() => void copy()}>
              {copied === 'yes' ? <Check size={15} /> : <Copy size={15} />} {copied === 'yes' ? 'Copied' : 'Copy'}
            </button>
          </div>
          {copied === 'select' && <p className="account-small">It’s selected: press Ctrl+C (⌘C on a Mac) to copy it.</p>}
          <HowToConnect url={made.url} />
          <p className="account-small">Anyone who has the link can read your stories, so keep it private. Revoke it here whenever you like.</p>
          <button className="link-btn" onClick={() => setMade(null)}>
            Done
          </button>
        </div>
      )}

      {links === null ? (
        <p className="account-small">Loading…</p>
      ) : (
        links.length > 0 && (
          <ul className="account-stories assistant-links">
            {links.map((l) => (
              <li key={l.id}>
                <span className="account-story-title">
                  {l.label || 'AI assistant'} <span className="assistant-hint">…{l.hint}</span>
                </span>
                <span className="account-story-when">{l.lastUsedAt ? `Read ${when(l.lastUsedAt)}` : 'Not used yet'}</span>
                <button className="btn ghost small" onClick={() => void revoke(l)} aria-label={`Revoke ${l.label || 'AI assistant'}`}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )
      )}
      <p className="account-small">
        To see what an assistant gets, try the example story first: <code>{assistantUrl('example')}</code>
      </p>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
