import { useMemo, useState } from 'react'
import { FileCode2, FileText, FileType2, Printer, type LucideIcon } from 'lucide-react'
import { useMentionLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { aboutWords, buildManuscript, toMarkdown, toPlainText, toPrintHtml, type ExportFormat, type HeadingStyle } from '../lib/manuscript'
import { downloadBlob, printHtml, slug } from '../lib/download'
import { plainText } from '../lib/mentions'
import { Modal } from './Modal'

const FORMATS: { id: ExportFormat; label: string; note: string; icon: LucideIcon; action: string }[] = [
  { id: 'docx', label: 'Word document', note: 'For Word, Google Docs or Pages, and for sending to editors', icon: FileText, action: 'Download .docx' },
  { id: 'pdf', label: 'PDF', note: 'Opens the print window, where you can save it as a PDF', icon: Printer, action: 'Print or save as PDF' },
  { id: 'txt', label: 'Plain text', note: 'Just the words, for anything that reads text', icon: FileType2, action: 'Download .txt' },
  { id: 'md', label: 'Markdown', note: 'Keeps italics, bold and headings as plain text', icon: FileCode2, action: 'Download .md' },
]

/** Exports the manuscript as Word, PDF, plain text or Markdown. */
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const title = useStory((s) => s.title)
  const chapters = useStory((s) => s.chapters)
  const texts = useStory((s) => s.texts)
  const lookup = useMentionLookup()
  const options = useUi((s) => s.exportOptions)
  const setOptions = useUi((s) => s.setExportOptions)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const manuscript = useMemo(() => buildManuscript({ title, chapters, texts }, lookup, options), [title, chapters, texts, lookup, options])
  const unwritten = chapters.filter((c) => !texts[c.id]?.words).length
  const format = FORMATS.find((f) => f.id === options.format) ?? FORMATS[0]
  const first = chapters[0]
  const firstTitle = first ? plainText(first.title, lookup).trim() : ''
  const example: Record<HeadingStyle, string> = {
    'number-title': `Chapter 1${firstTitle ? `: ${firstTitle}` : ''}`,
    title: firstTitle || 'The chapter’s title',
    number: 'Chapter 1',
  }

  const run = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const name = slug(manuscript.title)
      if (options.format === 'docx') {
        const { manuscriptDocx } = await import('../lib/docxExport')
        downloadBlob(await manuscriptDocx(manuscript), `${name}.docx`)
      } else if (options.format === 'pdf') {
        printHtml(toPrintHtml(manuscript))
      } else if (options.format === 'txt') {
        downloadBlob(new Blob([toPlainText(manuscript)], { type: 'text/plain;charset=utf-8' }), `${name}.txt`)
      } else {
        downloadBlob(new Blob([toMarkdown(manuscript)], { type: 'text/markdown;charset=utf-8' }), `${name}.md`)
      }
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const count = manuscript.chapters.length
  return (
    <Modal
      title="Export manuscript"
      onClose={onClose}
      footer={
        <>
          <span className="export-summary" aria-live="polite">
            {count ? `${count} chapter${count === 1 ? '' : 's'} · ${aboutWords(manuscript.words)}` : 'No chapters to export'}
          </span>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void run()} disabled={busy || !count}>
            {busy ? 'Preparing…' : format.action}
          </button>
        </>
      }
    >
      <h2 className="confirm-title">Export manuscript</h2>
      <p className="confirm-message">Every chapter’s text in order, laid out as a manuscript: double spaced, each chapter on a new page.</p>

      <fieldset className="export-formats">
        <legend className="field-label">Format</legend>
        {FORMATS.map((f) => {
          const Icon = f.icon
          return (
            <label key={f.id} className={`format-option${options.format === f.id ? ' active' : ''}`}>
              <input
                type="radio"
                name="export-format"
                value={f.id}
                checked={options.format === f.id}
                onChange={() => setOptions({ format: f.id })}
              />
              <Icon size={18} aria-hidden />
              <span className="format-text">
                <strong>{f.label}</strong>
                <small>{f.note}</small>
              </span>
            </label>
          )
        })}
      </fieldset>

      <label className="field">
        <span className="field-label">Chapter headings</span>
        <select className="select" value={options.headings} onChange={(e) => setOptions({ headings: e.target.value as HeadingStyle })}>
          {(['number-title', 'title', 'number'] as const).map((h) => (
            <option key={h} value={h}>
              {example[h]}
            </option>
          ))}
        </select>
      </label>

      <div className="export-checks">
        <label className="export-check">
          <input type="checkbox" checked={options.titlePage} onChange={(e) => setOptions({ titlePage: e.target.checked })} />
          <span>Start with a title page</span>
        </label>
        {options.titlePage && (
          <input
            className="plain-input export-author"
            value={options.author}
            onChange={(e) => setOptions({ author: e.target.value })}
            placeholder="Author name (optional)"
            aria-label="Author name"
          />
        )}
        <label className="export-check">
          <input type="checkbox" checked={options.skipEmpty} onChange={(e) => setOptions({ skipEmpty: e.target.checked })} />
          <span>
            Leave out chapters with nothing written yet
            {unwritten > 0 && (
              <span className="muted">
                {' '}
                ({unwritten} of {chapters.length})
              </span>
            )}
          </span>
        </label>
      </div>
      {failed && (
        <p className="export-error" role="alert">
          The file couldn’t be made. Try again, or choose another format.
        </p>
      )}
    </Modal>
  )
}
