import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import type { Node as PmNode } from '@tiptap/pm/model'
import { ChevronDown, ChevronLeft, ChevronRight, FileUp, ListChecks, Plus } from 'lucide-react'
import type { Chapter } from '../types'
import { onBeforeSwitch, useMentionLookup, useStory, useStoryEpoch } from '../store/storyStore'
import { archivedBeatIds } from '../lib/archived'
import { useUi } from '../store/uiStore'
import { flushStory, useSaveStatus } from '../store/persistence'
import { displayName, mentionToken, plainText } from '../lib/mentions'
import { BEAT_MARK, MENTION_NODE } from '../lib/richText'
import { manuscriptExtensions } from '../editor/extensions'
import { chapterIndexFor, linkedRanges } from '../editor/beatLinks'
import { findInDoc } from '../editor/findInDoc'
import { CurrentBlock } from '../editor/currentBlock'
import { FindHighlight } from '../editor/findHighlight'
import { Pages, pageCount, setPageGeometry } from '../editor/pages'
import { useBookStyle } from '../editor/useBookStyle'
import { StylePanel } from '../editor/StylePanel'
import { chapterNumber } from '../lib/bookStyle'
import { FindPanel } from '../editor/FindPanel'
import { useFind } from '../store/findStore'
import { FocusControls } from '../editor/FocusControls'
import { SprintButton } from '../components/Sprint'
import { FOCUS_KEYS, leaveFocus } from '../lib/focus'
import { countWords, wordChange } from '../editor/wordChanges'
import { tally, type WordTally } from '../lib/progress'
import type { TextFind } from '../lib/search'
import { Toolbar } from '../editor/Toolbar'
import { SelectionMenu } from '../editor/SelectionMenu'
import { BeatsPanel } from '../editor/BeatsPanel'
import { NewBeatDialog } from '../editor/NewBeatDialog'
import { MentionTextarea } from '../components/MentionTextarea'
import { dayKey } from '../store/storyOps'
import { PovPicker } from '../components/PovPicker'
import { CommentHighlight, markedAt, setCommentMarks, type MarkedPassage } from '../editor/commentHighlight'
import { anchorAt, docText, type TextAnchor } from '../comments/anchor'
import { inDraft } from '../comments/model'
import { openComments, startComment, useCommentCounts, useCommentPanel, useComments, useCommentsOn } from '../comments/store'
import { CommentCount, CommentsOn, SuggestButton } from '../components/Comments'
import { reviewing } from '../review/mode'
import type { RichNode } from '../types'

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
  // Find and replace stays open from chapter to chapter, but not beyond the manuscript.
  useEffect(() => () => useFind.getState().close(), [])

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
      <p>Chapters are where you write. Add the first one to start, or bring in a manuscript written elsewhere.</p>
      <div className="write-empty-actions">
        <button className="btn primary" onClick={() => navigate(`/write/${addChapter()}`)}>
          <Plus size={16} /> Add a chapter
        </button>
        <button className="btn" onClick={() => useUi.getState().setImportOpen(true)}>
          <FileUp size={16} /> Import a manuscript
        </button>
      </div>
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
  // (Reviewing someone's story, nothing typed here is saved: it can't be typed in anyway.)
  const blocked = useRef(reviewing)
  const unsaved = useRef<PmNode | null>(null)
  // Words added and cut since the last save, as they change the day's tallies.
  const written = useRef<WordTally>({ added: 0, cut: 0 })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => setLastChapterId(chapter.id), [chapter.id, setLastChapterId])

  // The saved text the editor holds: what it opened with, or last saved. Any other is a change from outside.
  const known = useRef(useStory.getState().texts[chapter.id])
  const saveNow = useCallback(() => {
    clearTimeout(timer.current)
    const doc = unsaved.current
    const change = written.current
    unsaved.current = null
    written.current = { added: 0, cut: 0 }
    setDirty(false)
    if (!doc || blocked.current) return
    setChapterText(chapter.id, { doc: doc.toJSON(), words: countWords(doc), updatedAt: Date.now() }, dayKey(), change)
    known.current = useStory.getState().texts[chapter.id]
  }, [chapter.id, setChapterText])

  const extensions = useMemo(
    () => [
      ...manuscriptExtensions(`Start writing chapter ${index + 1}…`),
      CurrentBlock,
      FindHighlight,
      Pages,
      CommentHighlight.configure({ onOpen: (id) => openComments({ focus: id }) }),
    ],
    [index],
  )
  const editor = useEditor({
    extensions,
    editable: !reviewing,
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

  // What's written is saved before another draft (or story) opens, so it stays in this one.
  useEffect(() => onBeforeSwitch(saveNow), [saveNow])

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
  // in the open editor so it doesn't save the old links back. (Archived ones stay:
  // they're still in the story, put away.)
  const knownNames = useRef(new Map<string, string>())
  const archive = useStory((s) => s.archive)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const beatIds = new Set([...Object.keys(beats), ...archivedBeatIds({ archive })])
    const names = knownNames.current
    for (const c of lookup.values()) names.set(c.id, displayName(c))
    const liveIds = new Set(lookup.keys())
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
  }, [editor, beats, lookup, archive])

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

  // The passages with comments on them, marked in the text (open ones, and the one being looked at).
  const commenting = useCommentsOn()
  const counts = useCommentCounts()
  const threads = useComments((s) => s.threads)
  const openDraftId = useStory((s) => s.draft)
  const looking = useCommentPanel((s) => (s.open ? s.focus : null))
  // Resolved ones are marked only while the panel shows the resolved comments.
  const showingResolved = useCommentPanel((s) => s.open && s.resolved)
  const passages = useMemo<MarkedPassage[]>(
    () =>
      threads
        .filter((t) => t.target.kind === 'text' && t.target.id === chapter.id && inDraft(t.target, openDraftId) && t.resolved === showingResolved)
        .map((t) => {
          const { quote, prefix, suffix, suggest } = t.target as TextAnchor & { suggest?: { text?: string } }
          // (A resolved suggestion is just where it was: accepted or not, there's no change to show.)
          return { id: t.id, quote, prefix, suffix, resolved: t.resolved, suggest: !t.resolved && typeof suggest?.text === 'string' ? suggest.text : undefined }
        }),
    [threads, chapter.id, openDraftId, showingResolved],
  )
  const nameOf = useCallback(
    (id: string, label: unknown) => {
      const named = lookup.get(id)
      return named ? displayName(named) : String(label ?? '')
    },
    [lookup],
  )

  // Opened from a comment: its passage, in the middle of the page, with the comment beside it.
  const wantComment = (location.state as { comment?: string } | null)?.comment
  useEffect(() => {
    if (!wantComment || !editor || editor.isDestroyed) return
    const phone = window.matchMedia('(max-width: 720px)').matches
    const panel = useCommentPanel.getState()
    if (!phone && (!panel.open || panel.focus !== wantComment)) return openComments({ focus: wantComment })
    const at = markedAt(editor, wantComment)
    if (at) {
      const { node } = editor.view.domAtPos(at.from)
      const el = node instanceof Element ? node : node.parentElement
      el?.scrollIntoView({ block: 'center' })
    }
    navigate('.', { replace: true, state: null })
  }, [wantComment, editor, passages, navigate])

  // The chapter's text changed from outside the editor (replaced in every chapter, or that undone):
  // show it, in place, without counting it as writing or making it an editor undo step.
  const stored = useStory((s) => s.texts[chapter.id])
  useEffect(() => {
    if (!editor || editor.isDestroyed || stored === known.current) return
    known.current = stored
    // The editor's own typing, not yet saved, is newer: it's saved over this next.
    if (unsaved.current) return
    try {
      const doc = stored ? editor.schema.nodeFromJSON(stored.doc) : editor.schema.topNodeType.createAndFill()
      if (!doc || doc.eq(editor.state.doc)) return
      editor.view.dispatch(
        editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content).setMeta('addToHistory', false).setMeta('preventUpdate', true),
      )
    } catch {
      // Text that can't be read stays as the editor has it.
    }
  }, [stored, editor])

  // (After the text, so passages come back once it's replaced from outside: a change accepted, or undone.)
  useEffect(() => {
    if (editor && !editor.isDestroyed) setCommentMarks(editor, passages, looking, nameOf)
  }, [editor, passages, looking, nameOf, stored])

  // Find and replace: Ctrl+F (⌘F) to find, Ctrl+H or Ctrl+Alt+F (⌘⌥F) to replace; what's selected is what's found.
  const findOpen = useFind((s) => s.open)
  const openFind = useCallback(
    (field: 'find' | 'replace') => {
      const { from, to, empty } = editor.state.selection
      const picked = empty ? '' : editor.state.doc.textBetween(from, to, '\n')
      useFind.getState().show(field, picked && picked.length <= 80 && !picked.includes('\n') ? picked : undefined)
    },
    [editor],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || document.querySelector('.modal')) return
      const replace = e.code === 'KeyH' || (e.code === 'KeyF' && e.altKey)
      if (e.code !== 'KeyF' && !replace) return
      e.preventDefault()
      openFind(replace ? 'replace' : 'find')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openFind])

  // Typewriter scrolling: the line being written stays near the middle, as you type or move with the keys.
  const scroller = useRef<HTMLDivElement>(null)

  // The book's style: how every chapter looks, and pages if it's shown as pages.
  const look = useBookStyle(scroller)
  const [styleOpen, setStyleOpen] = useState(false)
  useEffect(() => {
    if (editor && !editor.isDestroyed) setPageGeometry(editor.view, look.geometry)
  }, [editor, look.geometry])
  const pagesNow = useEditorState({ editor, selector: ({ editor: e }) => (e ? pageCount(e.state) : null) })
  const pages = !!look.geometry
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
  // The book's words, this chapter's as they are now.
  const totalWords = chapters.reduce((sum, c) => sum + (c.id === chapter.id ? (words ?? 0) : (texts[c.id]?.words ?? 0)), 0)
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

  const commentOnSelection = (suggesting = false) => {
    const { from, to, empty } = editor.state.selection
    if (empty) return
    const anchor = anchorAt(docText(editor.state.doc.toJSON() as RichNode, nameOf), from, to)
    if (anchor) startComment({ kind: 'text', id: chapter.id, ...anchor }, suggesting)
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

  const meta = (
    <div className="write-meta">
      <label className="chapter-jump" title="Go to another chapter">
        <span>
          Chapter {index + 1} <span className="muted">of {chapters.length}</span>
        </span>
        <ChevronDown size={14} />
        <select value={chapter.id} onChange={(e) => navigate(`/write/${e.target.value}`)} aria-label="Chapter">
          {chapters.map((c, i) => {
            const n = counts.chapters.get(c.id)
            return (
              <option key={c.id} value={c.id}>
                {chapterLabel(c, i)}
                {n ? ` · ${n} comment${n === 1 ? '' : 's'}` : ''}
              </option>
            )
          })}
        </select>
      </label>
      <CommentsOn kind="chapter" id={chapter.id} className="write-comments" />
      <SuggestButton target={{ kind: 'chapter', id: chapter.id }} className="btn ghost small write-suggest" />
      <span className="write-head-pickers">
        <PovPicker chapter={chapter} />
      </span>
    </div>
  )
  const summary = (
    <MentionTextarea
      className="write-summary"
      value={chapter.summary}
      placeholder="What happens in this chapter?"
      aria-label="Chapter summary"
      onChange={(summary) => updateChapter(chapter.id, { summary })}
    />
  )
  const notes = (
    <>
      {contentError && (
        <div className="write-error" role="alert">
          This chapter’s text couldn’t be opened, so editing is paused to keep it safe. You can restore an
          earlier copy from ⋯ → Backups.
        </div>
      )}
    </>
  )
  const foot = (
    <footer className={`write-foot${pages ? ' outside' : ''}`}>
      {next ? (
        <Link to={`/write/${next.id}`} className="next-chapter">
          Next: {chapterLabel(next, index + 1)} <CommentCount n={counts.chapters.get(next.id)} /> <ChevronRight size={16} />
        </Link>
      ) : (
        <span className="muted">End of the manuscript</span>
      )}
    </footer>
  )

  return (
    <div
      className={`write-page${showArcColors ? ' show-arcs' : ''}${focusMode ? ' focus' : ''}${typewriter ? ' typewriter' : ''}${fadeOthers ? ' fade-others' : ''}${look.className ? ` ${look.className}` : ''}`}
      style={look.vars as React.CSSProperties}
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
      <div className={`write-stage${styleOpen && !findOpen ? ' style-open' : ''}`}>
        {!reviewing && (
          <div className="write-toolbar-row">
            <Toolbar
              editor={editor}
              onFocusMode={focusMode ? undefined : () => setFocusMode(true)}
              focusKeys={FOCUS_KEYS}
              onFind={() => {
                setStyleOpen(false)
                openFind('find')
              }}
              onStyle={() => {
                useFind.getState().close()
                setStyleOpen((open) => !open)
              }}
              styleOpen={styleOpen}
            >
              <SprintButton />
            </Toolbar>
          </div>
        )}
        <div className="write-scroll" ref={scroller}>
          {pages && (
            <div className="write-above">
              {meta}
              {summary}
              {notes}
            </div>
          )}
          <article className={`write-paper${pov ? ' has-pov' : ''}`} style={{ '--pov': pov?.color } as React.CSSProperties}>
            <header className="write-head">
              {pages ? <span className="write-chapter-label">{chapterNumber(look.style, index + 1)}</span> : meta}
              <MentionTextarea
                className="write-title"
                value={chapter.title}
                placeholder="Untitled chapter"
                aria-label="Chapter title"
                submitOnEnter
                onSubmit={() => editor.commands.focus('start')}
                onChange={(title) => updateChapter(chapter.id, { title })}
              />
              {!pages && summary}
            </header>
            {!pages && notes}
            <EditorContent editor={editor} className="manuscript" />
            {!pages && foot}
          </article>
          {pages && foot}
        </div>
        {styleOpen && !findOpen && <StylePanel onClose={() => setStyleOpen(false)} tooNarrow={look.tooNarrow} />}
        {focusMode && !findOpen && <FocusControls />}
        {findOpen && <FindPanel editor={editor} chapterId={chapter.id} flush={saveNow} />}
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
          {pages && pagesNow ? <span>· {pagesNow} page{pagesNow === 1 ? '' : 's'}</span> : null}
          <button className="write-status-link" onClick={() => setProgressOpen(true)} title="Word count and goals">
            · {totalWords.toLocaleString()} in the manuscript
            {todayWords ? ` · +${todayWords.toLocaleString()} today` : ''}
          </button>
          <span className={`save-state ${saveStatus === 'error' ? 'error' : ''}`}>{saveLabel}</span>
        </div>
      </div>
      <SelectionMenu
        editor={editor}
        onNewBeat={openNewBeat}
        onComment={commenting ? () => commentOnSelection() : undefined}
        onSuggest={commenting && reviewing ? () => commentOnSelection(true) : undefined}
      />
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
