import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import type { Node as PmNode } from '@tiptap/pm/model'
import { ChevronDown, ChevronLeft, ChevronRight, ListChecks, Plus } from 'lucide-react'
import type { Chapter } from '../types'
import { useMentionables, useMentionLookup, useStory, useStoryEpoch } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { flushStory, useSaveStatus } from '../store/persistence'
import { displayName, mentionToken, plainText } from '../lib/mentions'
import { BEAT_MARK, MENTION_NODE } from '../lib/richText'
import { manuscriptExtensions } from '../editor/extensions'
import { chapterIndexFor, linkedRanges } from '../editor/beatLinks'
import { findInDoc } from '../editor/findInDoc'
import type { TextFind } from '../lib/search'
import { Toolbar } from '../editor/Toolbar'
import { SelectionMenu } from '../editor/SelectionMenu'
import { BeatsPanel } from '../editor/BeatsPanel'
import { NewBeatDialog } from '../editor/NewBeatDialog'
import { MentionTextarea } from '../components/MentionTextarea'
import { dayKey } from '../store/storyOps'
import { PovPicker } from '../components/PovPicker'
import { StatusPicker } from '../components/StatusPicker'

const SAVE_DELAY_MS = 400
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i
const SAFE_ID = /^[\w-]+$/

function countWords(doc: PmNode): number {
  const text = doc.textBetween(0, doc.content.size, ' ', (leaf) => (leaf.type.name === MENTION_NODE ? 'x' : ' '))
  return text.split(/\s+/).filter(Boolean).length
}

/** Beat title from selected text: the text itself, shortened at a word if long. */
function titleFrom(text: string): { title: string; description: string } {
  if (text.length <= 120) return { title: text, description: '' }
  let cut = text.slice(0, 110)
  cut = cut.slice(0, Math.max(cut.lastIndexOf(' '), 60))
  // Don't cut through a mention token.
  const open = cut.lastIndexOf('@{')
  if (open > cut.lastIndexOf('}')) cut = cut.slice(0, open)
  return { title: `${cut.trim()}…`, description: text }
}

export default function WritePage() {
  const { chapterId } = useParams()
  const chapters = useStory((s) => s.chapters)
  const lastChapterId = useUi((s) => s.lastChapterId)
  const epoch = useStoryEpoch((s) => s.epoch)
  const index = chapters.findIndex((c) => c.id === chapterId)

  if (chapters.length === 0) return <NoChapters />
  if (index === -1) {
    const fallback = chapters.find((c) => c.id === lastChapterId) ?? chapters[0]
    return <Navigate to={`/write/${fallback.id}`} replace />
  }
  // A fresh editor per chapter: its own undo history, saved when you leave.
  return <ChapterWriter key={`${chapters[index].id}:${epoch}`} chapter={chapters[index]} index={index} />
}

function NoChapters() {
  const addChapter = useStory((s) => s.addChapter)
  const navigate = useNavigate()
  return (
    <main className="write-empty">
      <h1>No chapters yet</h1>
      <p>Chapters are where you write. Add the first one to start.</p>
      <button className="btn primary" onClick={() => navigate(`/write/${addChapter()}`)}>
        <Plus size={16} /> Add a chapter
      </button>
    </main>
  )
}

interface WriterProps {
  chapter: Chapter
  index: number
}

function ChapterWriter({ chapter, index }: WriterProps) {
  const chapters = useStory((s) => s.chapters)
  const beats = useStory((s) => s.beats)
  const arcs = useStory((s) => s.arcs)
  const texts = useStory((s) => s.texts)
  const named = useMentionables()
  const pov = useStory((s) => s.characters.find((c) => c.id === chapter.povCharacterId))
  const updateChapter = useStory((s) => s.updateChapter)
  const setChapterText = useStory((s) => s.setChapterText)
  const addBeat = useStory((s) => s.addBeat)
  const showArcColors = useUi((s) => s.showArcColors)
  const beatsPanelOpen = useUi((s) => s.beatsPanelOpen)
  const toggleBeatsPanel = useUi((s) => s.toggleBeatsPanel)
  const setLastChapterId = useUi((s) => s.setLastChapterId)
  const saveStatus = useSaveStatus((s) => s.status)
  const lookup = useMentionLookup()
  const navigate = useNavigate()
  const location = useLocation()

  const [contentError, setContentError] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ from: number; to: number; title: string; description: string } | null>(null)
  const blocked = useRef(false)
  const unsaved = useRef<PmNode | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => setLastChapterId(chapter.id), [chapter.id, setLastChapterId])

  const saveNow = useCallback(() => {
    clearTimeout(timer.current)
    const doc = unsaved.current
    unsaved.current = null
    setDirty(false)
    if (!doc || blocked.current) return
    setChapterText(chapter.id, { doc: doc.toJSON(), words: countWords(doc), updatedAt: Date.now() })
  }, [chapter.id, setChapterText])

  const extensions = useMemo(() => manuscriptExtensions(`Start writing chapter ${index + 1}…`), [index])
  const editor = useEditor({
    extensions,
    content: useStory.getState().texts[chapter.id]?.doc ?? '',
    enableContentCheck: true,
    // Never save over text that couldn't be read.
    onContentError: ({ editor: e }) => {
      blocked.current = true
      setContentError(true)
      e.setEditable(false)
    },
    onUpdate: ({ editor: e, transaction }) => {
      if (!transaction.docChanged) return
      unsaved.current = e.state.doc
      setDirty(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(saveNow, SAVE_DELAY_MS)
    },
    editorProps: {
      attributes: { class: 'manuscript-text', spellcheck: 'true', 'aria-label': `Chapter ${index + 1} text` },
    },
  })

  // Save when leaving the chapter, and before the page is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      saveNow()
      void flushStory({ journal: true })
    }
    const onVisibility = () => document.visibilityState === 'hidden' && onHide()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHide)
      saveNow()
    }
  }, [saveNow])

  // Deleting a beat, character or element elsewhere cleans up saved texts; do the same
  // in the open editor so it doesn't save the old links back.
  const knownNames = useRef(new Map<string, string>())
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const beatIds = new Set(Object.keys(beats))
    const names = knownNames.current
    for (const c of named) names.set(c.id, displayName(c))
    const liveIds = new Set(named.map((c) => c.id))
    const { state } = editor
    const tr = state.tr
    const gone: { pos: number; node: PmNode }[] = []
    state.doc.descendants((node, pos) => {
      if (node.type.name === MENTION_NODE && !liveIds.has(String(node.attrs.id))) gone.push({ pos, node })
      if (!node.isText) return
      for (const mark of node.marks) {
        if (mark.type.name === BEAT_MARK && !beatIds.has(String(mark.attrs.beatId))) {
          tr.removeMark(pos, pos + node.nodeSize, mark)
        }
      }
    })
    for (const { pos, node } of gone.reverse()) {
      const name = names.get(String(node.attrs.id)) || String(node.attrs.label || 'unknown')
      tr.replaceWith(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize), state.schema.text(name, node.marks))
    }
    if (tr.docChanged) editor.view.dispatch(tr.setMeta('addToHistory', false))
  }, [editor, beats, named])

  // Opened from a search result: select what was found, in the middle of the page.
  const find = (location.state as { find?: TextFind } | null)?.find
  useEffect(() => {
    if (!find || !editor || editor.isDestroyed) return
    const nameOf = (id: string) => {
      const named = lookup.get(id)
      return named ? displayName(named) : 'unknown'
    }
    const range = findInDoc(editor.state.doc, find, nameOf)
    if (range) {
      editor.chain().focus(null, { scrollIntoView: false }).setTextSelection(range).run()
      const { node } = editor.view.domAtPos(range.from)
      const el = node instanceof Element ? node : node.parentElement
      el?.scrollIntoView({ block: 'center' })
    }
    navigate('.', { replace: true, state: null })
  }, [find, editor, lookup, navigate, location.key])

  const words = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? countWords(e.state.doc) : 0),
  })
  const totalWords =
    Object.entries(texts).reduce((sum, [id, t]) => (id === chapter.id ? sum : sum + t.words), 0) + (words ?? 0)
  const todayWords = useStory((s) => s.wordLog[dayKey()] ?? 0)
  const setProgressOpen = useUi((s) => s.setProgressOpen)

  // Colour linked text by arc; a hovered beat's text stands out even with colours off.
  const beatCss = useMemo(() => {
    const color = new Map(arcs.map((a) => [a.id, a.color]))
    const rules: string[] = []
    for (const beat of Object.values(beats)) {
      const c = color.get(beat.arcId)
      if (!c || !SAFE_COLOR.test(c) || !SAFE_ID.test(beat.id)) continue
      rules.push(`.show-arcs .beat-link[data-beat="${beat.id}"]{--beat:${c}}`)
      if (beat.id === hovered) rules.push(`.beat-link[data-beat="${beat.id}"]{--beat:${c};--beat-mix:34%}`)
    }
    return rules.join('\n')
  }, [beats, arcs, hovered])

  if (!editor) return null

  const prev = chapters[index - 1]
  const next = chapters[index + 1]
  const chapterLabel = (c: Chapter, i: number) =>
    `Chapter ${i + 1}${c.title ? `: ${plainText(c.title, lookup)}` : ''}`

  const openNewBeat = () => {
    const { from, to, empty } = editor.state.selection
    if (empty) return
    const text = editor.state.doc
      .textBetween(from, to, ' ', (leaf) => (leaf.type.name === MENTION_NODE ? mentionToken(String(leaf.attrs.id)) : ' '))
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) return
    setDraft({ from, to, ...titleFrom(text) })
  }

  const createBeat = ({ arcId, title, description }: { arcId: string; title: string; description: string }) => {
    if (!draft) return
    const at = chapterIndexFor(chapter.beatIds, linkedRanges(editor.state.doc), draft.from)
    const id = addBeat({ arcId, title, description, chapterId: chapter.id, chapterIndex: at, done: true })
    const end = Math.min(draft.to, editor.state.doc.content.size)
    editor.view.dispatch(editor.state.tr.addMark(draft.from, end, editor.schema.marks[BEAT_MARK].create({ beatId: id })))
    setDraft(null)
    editor.commands.focus()
  }

  const saveLabel = saveStatus === 'error' ? 'Not saved' : dirty || saveStatus === 'saving' ? 'Saving…' : 'Saved'

  return (
    <div className={`write-page${showArcColors ? ' show-arcs' : ''}`}>
      <style>{beatCss}</style>
      {beatsPanelOpen ? (
        <BeatsPanel chapter={chapter} editor={editor} onHover={setHovered} />
      ) : (
        <button className="beats-rail" onClick={toggleBeatsPanel} title="Show beats" aria-label="Show beats">
          <ListChecks size={18} />
          <span>
            {chapter.beatIds.filter((id) => beats[id]?.done).length}/{chapter.beatIds.length}
          </span>
        </button>
      )}
      <div className="write-stage">
        <div className="write-toolbar-row">
          <Toolbar editor={editor} />
        </div>
        <div className="write-scroll">
          <article className={`write-paper${pov ? ' has-pov' : ''}`} style={{ '--pov': pov?.color } as React.CSSProperties}>
            <header className="write-head">
              <div className="write-meta">
                <label className="chapter-jump" title="Go to another chapter">
                  <span>
                    Chapter {index + 1} <span className="muted">of {chapters.length}</span>
                  </span>
                  <ChevronDown size={14} />
                  <select value={chapter.id} onChange={(e) => navigate(`/write/${e.target.value}`)} aria-label="Chapter">
                    {chapters.map((c, i) => (
                      <option key={c.id} value={c.id}>
                        {chapterLabel(c, i)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="write-head-pickers">
                  <StatusPicker chapter={chapter} />
                  <PovPicker chapter={chapter} />
                </span>
              </div>
              <MentionTextarea
                className="write-title"
                value={chapter.title}
                placeholder="Untitled chapter"
                aria-label="Chapter title"
                submitOnEnter
                onSubmit={() => editor.commands.focus('start')}
                onChange={(title) => updateChapter(chapter.id, { title })}
              />
              <MentionTextarea
                className="write-summary"
                value={chapter.summary}
                placeholder="What happens in this chapter?"
                aria-label="Chapter summary"
                onChange={(summary) => updateChapter(chapter.id, { summary })}
              />
            </header>
            {contentError && (
              <div className="write-error" role="alert">
                This chapter’s text couldn’t be opened, so editing is paused to keep it safe. You can restore an
                earlier copy from ⋯ → Backups.
              </div>
            )}
            <EditorContent editor={editor} className="manuscript" />
            <footer className="write-foot">
              {next ? (
                <Link to={`/write/${next.id}`} className="next-chapter">
                  Next: {chapterLabel(next, index + 1)} <ChevronRight size={16} />
                </Link>
              ) : (
                <span className="muted">End of the manuscript</span>
              )}
            </footer>
          </article>
        </div>
        {prev && (
          <Link to={`/write/${prev.id}`} className="chapter-nav prev" title={`Previous: ${chapterLabel(prev, index - 1)}`} aria-label={`Previous chapter: ${chapterLabel(prev, index - 1)}`}>
            <ChevronLeft size={22} />
          </Link>
        )}
        {next && (
          <Link to={`/write/${next.id}`} className="chapter-nav next" title={`Next: ${chapterLabel(next, index + 1)}`} aria-label={`Next chapter: ${chapterLabel(next, index + 1)}`}>
            <ChevronRight size={22} />
          </Link>
        )}
        <div className="write-status" aria-live="polite">
          <span>
            {(words ?? 0).toLocaleString()}
            {chapter.targetWords ? ` / ${chapter.targetWords.toLocaleString()}` : ''} word{(chapter.targetWords ?? words) === 1 ? '' : 's'}
          </span>
          <button className="write-status-link" onClick={() => setProgressOpen(true)} title="Word count and goals">
            · {totalWords.toLocaleString()} in the manuscript
            {todayWords ? ` · ${todayWords > 0 ? '+' : '−'}${Math.abs(todayWords).toLocaleString()} today` : ''}
          </button>
          <span className={`save-state ${saveStatus === 'error' ? 'error' : ''}`}>{saveLabel}</span>
        </div>
      </div>
      <SelectionMenu editor={editor} onNewBeat={openNewBeat} />
      {draft && (
        <NewBeatDialog
          title={draft.title}
          description={draft.description}
          onCancel={() => {
            setDraft(null)
            editor.commands.focus()
          }}
          onCreate={createBeat}
        />
      )}
    </div>
  )
}
