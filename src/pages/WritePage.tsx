import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Archive, ChevronDown, ChevronLeft, ChevronRight, ListChecks, Plus } from 'lucide-react'
import type { Chapter } from '../types'
import { useMentionables, useMentionLookup, useStory, useStoryEpoch } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { flushStory, useSaveStatus } from '../store/persistence'
import { displayName, mentionToken, plainText } from '../lib/mentions'
import { BEAT_MARK, MENTION_NODE } from '../lib/richText'
import { manuscriptExtensions } from '../editor/extensions'
import { chapterIndexFor, linkedRanges } from '../editor/beatLinks'
import { findInDoc } from '../editor/findInDoc'
import { CurrentBlock } from '../editor/currentBlock'
import { FocusControls } from '../editor/FocusControls'
import { SprintButton } from '../components/Sprint'
import { FOCUS_KEYS, leaveFocus } from '../lib/focus'
import { countWords, wordChange } from '../editor/wordChanges'
import { tally, type WordTally } from '../lib/progress'
import { isShelved } from '../lib/chapterStatus'
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

/** Focus mode's keys: Ctrl+Shift+F (⌘⇧F) in and out, Esc out. Leaving the manuscript leaves it too. */
function useFocusKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        if (useUi.getState().focusMode) leaveFocus()
        else useUi.getState().setFocusMode(true)
      } else if (e.key === 'Escape' && useUi.getState().focusMode && !e.defaultPrevented) {
        // Not while a dialog, menu or mention list is open: Esc is theirs.
        if (document.querySelector('.modal, .mention-popup, [role="menu"]')) return
        leaveFocus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      leaveFocus()
    }
  }, [])
}

export default function WritePage() {
  const { chapterId } = useParams()
  const chapters = useStory((s) => s.chapters)
  const lastChapterId = useUi((s) => s.lastChapterId)
  const epoch = useStoryEpoch((s) => s.epoch)
  const index = chapters.findIndex((c) => c.id === chapterId)
  useFocusKeys()

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
  const focusMode = useUi((s) => s.focusMode)
  const typewriter = useUi((s) => s.focusMode && s.typewriter)
  const fadeOthers = useUi((s) => s.focusMode && s.fadeOthers)
  const setFocusMode = useUi((s) => s.setFocusMode)
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
  // Words added and cut since the last save, as they change the day's tallies.
  const written = useRef<WordTally>({ added: 0, cut: 0 })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => setLastChapterId(chapter.id), [chapter.id, setLastChapterId])

  const saveNow = useCallback(() => {
    clearTimeout(timer.current)
    const doc = unsaved.current
    const change = written.current
    unsaved.current = null
    written.current = { added: 0, cut: 0 }
    setDirty(false)
    if (!doc || blocked.current) return
    setChapterText(chapter.id, { doc: doc.toJSON(), words: countWords(doc), updatedAt: Date.now() }, dayKey(), change)
  }, [chapter.id, setChapterText])

  const extensions = useMemo(() => [...manuscriptExtensions(`Start writing chapter ${index + 1}…`), CurrentBlock], [index])
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
    onUpdate: ({ editor: e, transaction, appendedTransactions }) => {
      const transactions = [transaction, ...appendedTransactions]
      if (!transactions.some((tr) => tr.docChanged)) return
      // Each change's words, counted against the day's tallies as they'll be once saved.
      for (const tr of transactions) {
        const change = wordChange(tr)
        if (!change) continue
        const story = useStory.getState()
        const day = dayKey()
        const was = written.current
        const before = { added: (story.wordLog[day] ?? 0) + was.added, cut: (story.wordCuts[day] ?? 0) + was.cut }
        const after = tally(before, change)
        written.current = { added: was.added + after.added - before.added, cut: was.cut + after.cut - before.cut }
      }
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

  // Typewriter scrolling: the line being written stays near the middle, as you type or move with the keys.
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!typewriter || !editor || editor.isDestroyed) return
    let byKeys = true
    const center = () => {
      const el = scroller.current
      const { selection } = editor.state
      if (!el || !selection.empty || !editor.isFocused) return
      const caret = editor.view.coordsAtPos(selection.head)
      const box = el.getBoundingClientRect()
      const off = (caret.top + caret.bottom) / 2 - (box.top + box.height * 0.45)
      if (Math.abs(off) > 2) el.scrollBy({ top: off })
    }
    const onSelect = () => byKeys && center()
    const keys = () => (byKeys = true)
    const pointer = () => (byKeys = false)
    const dom = editor.view.dom
    dom.addEventListener('keydown', keys)
    dom.addEventListener('pointerdown', pointer)
    editor.on('update', center)
    editor.on('selectionUpdate', onSelect)
    center()
    return () => {
      dom.removeEventListener('keydown', keys)
      dom.removeEventListener('pointerdown', pointer)
      editor.off('update', center)
      editor.off('selectionUpdate', onSelect)
    }
  }, [typewriter, editor])

  const words = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? countWords(e.state.doc) : 0),
  })
  // The book's words, this chapter's as they are now (shelved chapters are left out).
  const totalWords = chapters.reduce(
    (sum, c) => (isShelved(c) ? sum : sum + (c.id === chapter.id ? (words ?? 0) : (texts[c.id]?.words ?? 0))),
    0,
  )
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
    `Chapter ${i + 1}${c.title ? `: ${plainText(c.title, lookup)}` : ''}${isShelved(c) ? ' (shelved)' : ''}`

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
    <div
      className={`write-page${showArcColors ? ' show-arcs' : ''}${focusMode ? ' focus' : ''}${typewriter ? ' typewriter' : ''}${fadeOthers ? ' fade-others' : ''}`}
    >
      <style>{beatCss}</style>
      {focusMode ? null : beatsPanelOpen ? (
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
          <Toolbar editor={editor} onFocusMode={focusMode ? undefined : () => setFocusMode(true)} focusKeys={FOCUS_KEYS}>
            <SprintButton />
          </Toolbar>
        </div>
        <div className="write-scroll" ref={scroller}>
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
            {isShelved(chapter) && (
              <div className="write-shelved" role="note">
                <Archive size={16} aria-hidden />
                <span>Shelved for now: its words aren’t counted in the manuscript, and it’s left out when you export.</span>
                <button className="btn ghost small" onClick={() => updateChapter(chapter.id, { status: words ? 'draft' : 'outline' })}>
                  Put it back
                </button>
              </div>
            )}
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
        {focusMode && <FocusControls />}
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
            {todayWords ? ` · +${todayWords.toLocaleString()} today` : ''}
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
