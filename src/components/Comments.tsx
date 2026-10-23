import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Bot, Check, Feather, MessageSquare, MessageSquarePlus, MoreHorizontal, PenLine, RotateCcw, X } from 'lucide-react'
import { useMentionLookup, useStory } from '../store/storyStore'
import { notify } from '../store/history'
import { askConfirm } from '../lib/confirm'
import { when } from '../lib/when'
import { displayName } from '../lib/mentions'
import { docText, findAnchor, quoteLine } from '../comments/anchor'
import {
  authorName,
  describeTarget,
  draftOf,
  inDraft,
  isOn,
  type CommentTarget,
  type CommentThread,
  type StoryComment,
  type TargetKind,
} from '../comments/model'
import { useGoTo } from '../comments/goTo'
import {
  addComment,
  closeComments,
  filterFor,
  startComment,
  editComment,
  openComments,
  removeComment,
  replyTo,
  resolveThread,
  useCommentCounts,
  useCommentPanel,
  useComments,
  useCommentsOn,
  useViewer,
  type CommentFilter,
} from '../comments/store'

// Comments on the story: the panel that lists them (all, or those on one
// thing), each thread with its replies, and writing new ones; the little
// counts on the buttons and cards where there are open comments; and the
// buttons that start a comment on something.

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** A little count of open comments, on a button or a card. */
export function CommentCount({ n, onClick, title }: { n: number | undefined; onClick?: () => void; title?: string }) {
  if (!n) return null
  const label = title ?? `${plural(n, 'open comment')}`
  if (!onClick)
    return (
      <span className="comment-count" title={label} aria-label={label}>
        {n}
      </span>
    )
  return (
    <button
      type="button"
      className="comment-count as-button"
      title={label}
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <MessageSquare size={11} aria-hidden />
      {n}
    </button>
  )
}

/** The count on something, which opens its comments. */
export function CommentsOn({ kind, id, node, className }: { kind: TargetKind; id?: string; node?: string; className?: string }) {
  const counts = useCommentCounts()
  const n =
    kind === 'chapter'
      ? counts.chapters.get(id!)
      : kind === 'map'
        ? node
          ? counts.cards.get(node)
          : counts.maps.get(id!)
        : kind === 'story'
          ? counts.places.story
          : counts.things.get(id!)
  if (!n) return null
  return (
    <span className={className}>
      <CommentCount n={n} onClick={() => openComments({ filter: { kind, id, node } })} title={`${plural(n, 'open comment')}: show`} />
    </span>
  )
}

/** The top bar's button: every open comment (in the open draft). */
export function CommentsButton() {
  const on = useCommentsOn()
  const counts = useCommentCounts()
  const open = useCommentPanel((s) => s.open)
  if (!on) return null
  return (
    <button
      className={`icon-btn topbar-comments${open ? ' active' : ''}`}
      onClick={() => (open ? closeComments() : openComments())}
      aria-label={counts.total ? `Comments: ${plural(counts.total, 'open comment')}` : 'Comments'}
      aria-expanded={open}
      title="Comments"
    >
      <MessageSquare size={17} />
      {counts.total > 0 && <span className="comment-count on-icon">{counts.total}</span>}
    </button>
  )
}

/** A button that starts a comment on something (and shows how many it has). */
export function CommentButton({ target, label = 'Comment', className = 'btn ghost small' }: { target: CommentTarget; label?: string; className?: string }) {
  const on = useCommentsOn()
  if (!on) return null
  return (
    <button type="button" className={className} onClick={() => startComment(target)}>
      <MessageSquarePlus size={15} /> {label}
    </button>
  )
}

const ICONS: Record<StoryComment['author']['kind'], ReactNode> = {
  writer: <Feather size={13} aria-hidden />,
  editor: <PenLine size={13} aria-hidden />,
  assistant: <Bot size={13} aria-hidden />,
}

// ---------- The panel ----------

export function CommentsPanel() {
  const open = useCommentPanel((s) => s.open)
  const on = useCommentsOn()
  if (!open || !on) return null
  return createPortal(<Panel />, document.body)
}

function Panel() {
  const threads = useComments((s) => s.threads)
  const error = useComments((s) => s.error)
  const loaded = useComments((s) => s.loaded)
  const { filter, focus, compose, resolved } = useCommentPanel()
  const data = useStory((s) => s)
  const lookup = useMentionLookup()
  const viewer = useViewer()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) closeComments()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const matching = threads.filter((t) => !filter || isOn(t.target, filter.kind, filter.id, filter.node))
  const here = matching.filter((t) => inDraft(t.target, data.draft))
  const elsewhere = matching.filter((t) => !inDraft(t.target, data.draft) && !t.resolved)
  const openOnes = here.filter((t) => !t.resolved)
  const done = here.filter((t) => t.resolved)
  const shown = resolved ? done : openOnes
  const filterLabel = filter && filter.kind !== 'story' ? describeTarget(filterTarget(filter), data, lookup).label : filter ? 'The whole story' : null

  return (
    <aside className="comments-panel" aria-label="Comments" ref={box}>
      <div className="comments-head">
        <h2 className="comments-title">
          <MessageSquare size={17} aria-hidden /> Comments
        </h2>
        <button className="icon-btn" onClick={closeComments} aria-label="Close comments" title="Close (Esc)">
          <X size={17} />
        </button>
      </div>
      {filterLabel && (
        <div className="comments-filter">
          <span className="comments-filter-label">On {filterLabel}</span>
          <button className="link-btn" onClick={() => useCommentPanel.setState({ filter: null, compose: null })}>
            Show all
          </button>
        </div>
      )}
      <div className="comments-tabs" role="tablist" aria-label="Open or resolved">
        <button role="tab" aria-selected={!resolved} className={!resolved ? 'active' : ''} onClick={() => useCommentPanel.setState({ resolved: false })}>
          Open <span className="comments-tab-n">{openOnes.length}</span>
        </button>
        <button role="tab" aria-selected={resolved} className={resolved ? 'active' : ''} onClick={() => useCommentPanel.setState({ resolved: true })}>
          Resolved <span className="comments-tab-n">{done.length}</span>
        </button>
      </div>
      <div className="comments-scroll">
        {compose ? (
          <Composer target={compose} />
        ) : (
          <button className="comments-new" onClick={() => startComment(filter && filter.kind !== 'story' ? filterTarget(filter) : { kind: 'story' })}>
            <MessageSquarePlus size={16} /> {filterLabel && filter?.kind !== 'story' ? `Comment on ${filterLabel}` : 'Comment on the whole story'}
          </button>
        )}
        {error && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}
        {!loaded && !threads.length && !error && <p className="comments-empty">Loading the comments…</p>}
        {loaded && !shown.length && (
          <p className="comments-empty">
            {resolved
              ? 'Nothing resolved yet.'
              : viewer === 'editor'
                ? 'No open comments yet. Select words in the manuscript, or use the comment buttons on chapters, beats, arcs, characters, places and mind map cards.'
                : filter
                  ? 'No open comments on this.'
                  : 'No open comments. Share the story for comments (⋯ → Share for comments), or ask an AI assistant to comment.'}
          </p>
        )}
        {shown.map((t) => (
          <ThreadCard key={t.id} thread={t} focused={t.id === focus} />
        ))}
        {!resolved && elsewhere.length > 0 && <OtherDrafts threads={elsewhere} />}
      </div>
    </aside>
  )
}

/** A filter's thing as a target, to name it. */
const filterTarget = (f: CommentFilter): CommentTarget =>
  (f.kind === 'map' ? { kind: 'map', id: f.id!, node: f.node } : { kind: f.kind, id: f.id }) as CommentTarget

/** Open comments on another draft's chapters, arcs and beats, by draft. */
function OtherDrafts({ threads }: { threads: CommentThread[] }) {
  const drafts = useStory((s) => s.drafts)
  const switchDraft = useStory((s) => s.switchDraft)
  const byDraft = new Map<string, number>()
  for (const t of threads) {
    const d = draftOf(t.target)
    if (d) byDraft.set(d, (byDraft.get(d) ?? 0) + 1)
  }
  return (
    <div className="comments-other">
      {[...byDraft].map(([id, n]) => {
        const draft = drafts.find((d) => d.id === id)
        return (
          <div key={id} className="comments-other-row">
            <span>
              {plural(n, 'open comment')} on {draft ? `“${draft.name}”` : 'a draft that’s been deleted'}
            </span>
            {draft && (
              <button
                className="btn ghost small"
                onClick={() => {
                  switchDraft(id)
                  notify(`Opened “${draft.name}”.`)
                }}
              >
                Open draft
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Whether a passage's words are still in its chapter: as they were, changed, or gone. */
function usePassage(target: CommentTarget): 'here' | 'changed' | 'gone' | null {
  const text = useStory((s) => (target.kind === 'text' ? s.texts[target.id] : undefined))
  const lookup = useMentionLookup()
  return useMemo(() => {
    if (target.kind !== 'text') return null
    if (!text) return 'gone'
    const named = (id: string, label: unknown) => {
      const m = lookup.get(id)
      return m ? displayName(m) : String(label ?? '')
    }
    const found = findAnchor(docText(text.doc, named), target)
    return !found ? 'gone' : found.exact ? 'here' : 'changed'
  }, [target, text, lookup])
}

function ThreadCard({ thread, focused }: { thread: CommentThread; focused: boolean }) {
  const data = useStory((s) => s)
  const lookup = useMentionLookup()
  const viewer = useViewer()
  const goTo = useGoTo()
  const card = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  const passage = usePassage(thread.target)
  const { label, gone } = describeTarget(thread.target, data, lookup)

  useEffect(() => {
    if (focused) card.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focused])

  const resolve = async (value: boolean) => {
    setBusy(true)
    try {
      await resolveThread(thread.id, value)
      notify(value ? 'Resolved.' : 'Opened again.')
    } catch (error) {
      notify(message(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article ref={card} className={`comment-thread${focused ? ' focused' : ''}${thread.resolved ? ' resolved' : ''}`} aria-label={`Comment on ${label}`}>
      <div className="comment-on">
        {thread.target.kind === 'story' ? (
          <span className="comment-on-label">{label}</span>
        ) : (
          <button className="comment-on-label link-like" onClick={() => goTo(thread)} disabled={gone} title={gone ? undefined : 'Show it'}>
            {label}
            {!gone && <ArrowUpRight size={13} aria-hidden />}
          </button>
        )}
        {gone && <span className="comment-note">No longer in the story</span>}
      </div>
      {thread.target.kind === 'text' && (
        <blockquote className="comment-quote">
          {quoteLine(thread.target.quote, 220)}
          {passage === 'changed' && <span className="comment-note"> The words have changed since.</span>}
          {passage === 'gone' && !gone && <span className="comment-note"> Not in the chapter any more.</span>}
        </blockquote>
      )}
      <Comment comment={thread.first} viewer={viewer} />
      {thread.replies.map((r) => (
        <Comment key={r.id} comment={r} viewer={viewer} reply />
      ))}
      {thread.resolved && thread.first.resolvedAt && (
        <p className="comment-resolved">
          <Check size={13} aria-hidden /> Resolved{thread.first.resolvedBy ? ` by ${thread.first.resolvedBy}` : viewer === 'writer' ? ' by you' : ''} {when(thread.first.resolvedAt)}
        </p>
      )}
      <div className="comment-actions">
        <Reply thread={thread} />
        {thread.resolved ? (
          <button className="btn ghost small" disabled={busy} onClick={() => void resolve(false)}>
            <RotateCcw size={14} /> Reopen
          </button>
        ) : (
          <button className="btn ghost small" disabled={busy} onClick={() => void resolve(true)} title="Done with: put it away with the resolved ones">
            <Check size={14} /> Resolve
          </button>
        )}
      </div>
    </article>
  )
}

function Comment({ comment, viewer, reply }: { comment: StoryComment; viewer: 'writer' | 'editor'; reply?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(comment.body)
  const [menu, setMenu] = useState(false)
  // The writer may delete any comment on their story; others, their own.
  const canDelete = viewer === 'writer' || comment.mine
  const canEdit = comment.mine

  const save = async () => {
    if (!text.trim()) return
    try {
      await editComment(comment.id, text)
      setEditing(false)
    } catch (error) {
      notify(message(error))
    }
  }
  const remove = async () => {
    setMenu(false)
    const ok = await askConfirm({
      title: reply ? 'Delete this reply?' : 'Delete this comment?',
      message: reply ? 'It’s taken out of the thread for everyone.' : 'It’s taken away for everyone, with its replies.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await removeComment(comment.id)
    } catch (error) {
      notify(message(error))
    }
  }

  return (
    <div className={`comment${reply ? ' reply' : ''}`}>
      <div className="comment-meta">
        <span className={`comment-author ${comment.author.kind}`}>
          {ICONS[comment.author.kind]}
          {authorName(comment, viewer)}
          {comment.author.kind === 'assistant' && <span className="comment-ai">AI</span>}
        </span>
        <span className="comment-when" title={new Date(comment.createdAt).toLocaleString()}>
          {when(comment.createdAt)}
          {comment.editedAt ? ' · edited' : ''}
        </span>
        {(canEdit || canDelete) && !editing && (
          <span className="comment-more">
            <button className="icon-btn small" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <MoreHorizontal size={15} />
            </button>
            {menu && (
              <span className="menu-list comment-menu" role="menu">
                {canEdit && (
                  <button
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      setMenu(false)
                      setText(comment.body)
                      setEditing(true)
                    }}
                  >
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button role="menuitem" className="menu-item danger" onClick={() => void remove()}>
                    Delete
                  </button>
                )}
              </span>
            )}
          </span>
        )}
      </div>
      {editing ? (
        <form
          className="comment-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <textarea className="plain-input" value={text} autoFocus maxLength={5000} rows={3} onChange={(e) => setText(e.target.value)} aria-label="Comment" />
          <div className="comment-form-actions">
            <button className="btn primary small" disabled={!text.trim()}>
              Save
            </button>
            <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="comment-body">{comment.body}</p>
      )}
    </div>
  )
}

function Reply({ thread }: { thread: CommentThread }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open)
    return (
      <button className="btn ghost small" onClick={() => setOpen(true)}>
        Reply
      </button>
    )
  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await replyTo(thread.id, text)
      setText('')
      setOpen(false)
    } catch (error) {
      notify(message(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="comment-form reply-form"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <textarea
        className="plain-input"
        value={text}
        autoFocus
        rows={2}
        maxLength={5000}
        placeholder={thread.resolved ? 'Reply (opens it again)' : 'Reply'}
        aria-label="Reply"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
          if (e.key === 'Escape') {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      <div className="comment-form-actions">
        <button className="btn primary small" disabled={!text.trim() || busy}>
          {busy ? 'Sending…' : 'Reply'}
        </button>
        <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/** Writing a new comment on something. */
function Composer({ target }: { target: CommentTarget }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const data = useStory((s) => s)
  const lookup = useMentionLookup()
  const { label } = describeTarget(target, data, lookup)
  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      const id = await addComment(target, text)
      useCommentPanel.setState({ compose: null, focus: id, resolved: false })
      notify('Comment posted.')
    } catch (error) {
      notify(message(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="comment-thread composing"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <div className="comment-on">
        <span className="comment-on-label">New comment on {label}</span>
      </div>
      {target.kind === 'text' && <blockquote className="comment-quote">{quoteLine(target.quote, 220)}</blockquote>}
      <textarea
        className="plain-input"
        value={text}
        autoFocus
        rows={4}
        maxLength={5000}
        placeholder="What do you think?"
        aria-label="Your comment"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
        }}
      />
      <div className="comment-form-actions">
        <button className="btn primary small" disabled={!text.trim() || busy}>
          {busy ? 'Posting…' : 'Comment'}
        </button>
        <button type="button" className="btn ghost small" onClick={() => useCommentPanel.setState({ compose: null })}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/**
 * The comments on one thing, in its own page or panel (a beat, an arc, a
 * character…): a count and a button to start one, opening the panel.
 */
export function CommentsHere({ target }: { target: CommentTarget }) {
  const on = useCommentsOn()
  const threads = useComments((s) => s.threads)
  const draft = useStory((s) => s.draft)
  if (!on) return null
  const filter = filterFor(target)
  const mine = threads.filter((t) => isOn(t.target, filter.kind, filter.id, filter.node) && inDraft(t.target, draft))
  const open = mine.filter((t) => !t.resolved)
  return (
    <div className="comments-here">
      <button className="btn ghost small" onClick={() => startComment(target)}>
        <MessageSquarePlus size={15} /> Comment
      </button>
      {mine.length > 0 && (
        <button className="link-btn" onClick={() => openComments({ filter })}>
          {open.length ? plural(open.length, 'open comment') : `${plural(mine.length - open.length, 'resolved comment')}`}
        </button>
      )}
    </div>
  )
}
