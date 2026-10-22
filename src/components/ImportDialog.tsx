import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp } from 'lucide-react'
import type { RichNode } from '../types'
import { useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { emptyStory, importChapters } from '../store/storyOps'
import { swapInStory } from '../store/swapIn'
import { useCloud } from '../cloud'
import { askConfirm } from '../lib/confirm'
import { blockText, bookTitle, detectSplit, isChapterLine, splitChapters, type ImportedChapter, type SplitMode } from '../lib/manuscriptImport'
import { Modal } from './Modal'

const FILES = '.docx,.md,.markdown,.txt,.text'
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
/** Front matter shorter than this (a title page) starts unticked. */
const SHORT_FRONT = 60

/** The opening words of a chapter, to know it by. */
function opening(doc: RichNode): string {
  const words = (doc.content ?? [])
    .map(blockText)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
  return words.slice(0, 14).join(' ') + (words.length > 14 ? '…' : '')
}

interface Read {
  name: string
  doc: RichNode
  pictures: number
  title?: string
}

/**
 * Bringing in a manuscript written elsewhere (Word, Markdown or plain text):
 * read, split into chapters where it says (or where you say), looked over,
 * and added to this story or started as a new one.
 */
export function ImportDialog() {
  const setOpen = useUi((s) => s.setImportOpen)
  const chapters = useStory((s) => s.chapters)
  const addChapters = useStory((s) => s.importChapters)
  const signedIn = useCloud((s) => !!s.user)
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [read, setRead] = useState<Read | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [mode, setMode] = useState<SplitMode>('none')
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [target, setTarget] = useState<'here' | 'new'>('here')
  const [title, setTitle] = useState('')
  const close = () => setOpen(false)

  const found = useMemo(() => (read ? splitChapters(read.doc, mode) : []), [read, mode])
  const counts = useMemo(() => {
    const blocks = read?.doc.content ?? []
    const headings = (l: number) => blocks.filter((n) => n.type === 'heading' && Number(n.attrs?.level) === l && blockText(n).trim()).length
    return { h1: headings(1), h2: headings(2), h3: headings(3), lines: blocks.filter(isChapterLine).length }
  }, [read])
  const picked = found.filter((_, i) => !skipped.has(i))
  const words = picked.reduce((n, c) => n + c.words, 0)

  /** The same choices for a new split: front matter that's only a title page left out. */
  const choose = (next: SplitMode, doc = read?.doc) => {
    if (!doc) return
    setMode(next)
    const chapters = splitChapters(doc, next)
    setSkipped(new Set(chapters.flatMap((c, i) => (c.front && c.words < SHORT_FRONT ? [i] : []))))
  }

  const open = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setReading(true)
    try {
      const { readManuscript } = await import('../lib/readManuscript')
      const result = await readManuscript(file)
      const auto = detectSplit(result.doc)
      setRead({ name: file.name, ...result })
      setTitle(result.title || bookTitle(result.doc, auto) || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim())
      choose(auto, result.doc)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'That file couldn’t be read.')
    } finally {
      setReading(false)
    }
  }

  const bring = async () => {
    const chosen: ImportedChapter[] = picked
    if (!chosen.length) return
    if (target === 'here') {
      const ids = addChapters(chosen)
      close()
      navigate(`/write/${ids[0]}`)
      return
    }
    const name = title.trim() || 'Imported story'
    const ok = await askConfirm({
      title: signedIn ? `Start “${name}” as a new story?` : `Replace your story with “${name}”?`,
      message: signedIn
        ? 'It’s added to your account as a new story; the one open now stays in your account.'
        : 'Everything in your story now will be replaced. A backup of it is kept (⋯ → Backups).',
      confirmLabel: signedIn ? 'Start new story' : 'Replace story',
      danger: !signedIn,
    })
    if (!ok) return
    const [story] = importChapters(emptyStory(name), chosen)
    await swapInStory(story)
    close()
    navigate('/write')
  }

  const toggle = (i: number) =>
    setSkipped((was) => {
      const next = new Set(was)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const modes: { mode: SplitMode; label: string; n?: number }[] = [
    { mode: 'h1', label: 'Headings', n: counts.h1 },
    { mode: 'h2', label: 'Subheadings', n: counts.h2 },
    { mode: 'h3', label: 'Small headings', n: counts.h3 },
    { mode: 'lines', label: 'Lines like “Chapter 1”', n: counts.lines },
    { mode: 'none', label: 'Nowhere: it’s one chapter' },
  ]

  return (
    <Modal
      title="Import a manuscript"
      onClose={close}
      variant="wide"
      footer={
        <>
          {read && (
            <span className="export-summary" aria-live="polite">
              {picked.length ? `${count(picked.length, 'chapter')} · ${count(words, 'word')}` : 'No chapters picked'}
            </span>
          )}
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          {read && (
            <button className="btn primary" onClick={() => void bring()} disabled={!picked.length}>
              <FileUp size={16} /> {target === 'here' ? `Add ${count(picked.length, 'chapter')}` : 'Start the new story'}
            </button>
          )}
        </>
      }
    >
      <h2 className="confirm-title">Import a manuscript</h2>
      {!read ? (
        <>
          <p className="confirm-message">
            Bring in a book or chapters written elsewhere: a Word document, Markdown or plain text. They’re split into chapters at
            their headings, or at lines like “Chapter 1”, and you see them before anything is added.
          </p>
          <div
            className={`import-drop${dragging ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void open(e.dataTransfer.files[0])
            }}
          >
            <FileUp size={26} aria-hidden />
            <span>{reading ? 'Reading…' : 'Drop a .docx, .md or .txt file here'}</span>
            <button className="btn" onClick={() => input.current?.click()} disabled={reading}>
              Choose a file
            </button>
            <input
              ref={input}
              type="file"
              accept={FILES}
              hidden
              aria-label="Manuscript file"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                void open(file)
              }}
            />
          </div>
          {error && (
            <p className="export-error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="import-file">
            <strong>{read.name}</strong> · {count(found.length, 'chapter')} · {count(found.reduce((n, c) => n + c.words, 0), 'word')}
            {read.pictures ? ` · ${count(read.pictures, 'picture')}` : ''}
            <button className="btn ghost small" onClick={() => setRead(null)}>
              Another file
            </button>
          </p>
          <label className="field">
            <span className="field-label">Chapters start at</span>
            <select className="select" value={mode} onChange={(e) => choose(e.target.value as SplitMode)} aria-label="Chapters start at">
              {modes.map((m) => (
                <option key={m.mode} value={m.mode} disabled={m.n === 0}>
                  {m.label}
                  {m.n !== undefined ? ` (${m.n})` : ''}
                </option>
              ))}
            </select>
          </label>
          <ol className="import-chapters" aria-label="Chapters found">
            {found.map((c, i) => (
              <li key={i} className={skipped.has(i) ? 'skipped' : undefined}>
                <label>
                  <input type="checkbox" checked={!skipped.has(i)} onChange={() => toggle(i)} />
                  <span className="import-chapter-text">
                    <span className="import-chapter-title">
                      {c.front ? <em>Before the first chapter</em> : c.title || <span className="muted">Untitled</span>}
                    </span>
                    <span className="import-chapter-opening">{opening(c.doc) || 'Nothing written'}</span>
                  </span>
                  <span className="import-chapter-words">{c.words.toLocaleString()}</span>
                </label>
              </li>
            ))}
          </ol>
          <fieldset className="import-target">
            <legend className="field-label">Where</legend>
            <label className="export-check">
              <input type="radio" name="import-target" checked={target === 'here'} onChange={() => setTarget('here')} />
              <span>
                Add to this story{chapters.length ? `, after chapter ${chapters.length}` : ''}
                <span className="muted"> (one step to undo)</span>
              </span>
            </label>
            <label className="export-check">
              <input type="radio" name="import-target" checked={target === 'new'} onChange={() => setTarget('new')} />
              <span>Start a new story with them</span>
            </label>
            {target === 'new' && (
              <input className="plain-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The new story’s title" aria-label="New story title" />
            )}
          </fieldset>
        </>
      )}
    </Modal>
  )
}
