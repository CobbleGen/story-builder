import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { ArrowDown, ArrowUp, CaseSensitive, Replace, Search, WholeWord, X } from 'lucide-react'
import { useMentionables, useMentionLookup, useStory } from '../store/storyStore'
import { useHistory } from '../store/history'
import { useFind, type FindScope } from '../store/findStore'
import { countInDoc, matcher } from '../lib/replace'
import { displayName, plainText } from '../lib/mentions'
import { findState, setFind } from './findHighlight'

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'
const SCOPES: { scope: FindScope; label: string }[] = [
  { scope: 'chapter', label: 'This chapter' },
  { scope: 'all', label: 'All chapters' },
]
const times = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'match' : 'matches'}`

/** Picks out match `i` in the open chapter: highlighted, selected and scrolled to. */
function pick(editor: Editor, re: RegExp | null, i: number) {
  setFind(editor, re, i)
  const { matches, current } = findState(editor)
  const m = matches[current]
  if (m) editor.chain().setTextSelection(m).scrollIntoView().run()
}

/**
 * Find and replace in the manuscript, over the open chapter: its matches
 * highlighted, gone through one by one (on into the next chapters, when
 * looking in all of them), replaced one at a time or all at once.
 */
export function FindPanel({ editor, chapterId, flush }: { editor: Editor; chapterId: string; flush: () => void }) {
  const f = useFind()
  const chapters = useStory((s) => s.chapters)
  const texts = useStory((s) => s.texts)
  const replaceText = useStory((s) => s.replaceText)
  const named = useMentionables()
  const lookup = useMentionLookup()
  const navigate = useNavigate()
  const findInput = useRef<HTMLInputElement>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  const query = useMemo(() => ({ text: f.text, matchCase: f.matchCase, wholeWord: f.wholeWord }), [f.text, f.matchCase, f.wholeWord])
  const re = useMemo(() => matcher(query), [query])
  const here = useEditorState({ editor, selector: ({ editor: e }) => ({ count: findState(e).matches.length, current: findState(e).current }) })
  const index = chapters.findIndex((c) => c.id === chapterId)
  const latest = useHistory((s) => s.past.at(-1))

  // In the other chapters: how many in each (from their saved text).
  const elsewhere = useMemo(() => {
    if (!re) return []
    return chapters
      .map((c, i) => ({ c, i, count: c.id === chapterId || !texts[c.id] ? 0 : countInDoc(texts[c.id].doc, re) }))
      .filter((x) => x.count)
  }, [re, chapters, texts, chapterId])
  const elsewhereTotal = elsewhere.reduce((n, x) => n + x.count, 0)

  const go = (i: number) => pick(editor, re, i)

  // Highlights follow the query; arriving from another chapter, its first (or last) match.
  // (Just after React is done: redrawing the text redraws the names in it, which React draws too.)
  useEffect(() => {
    let live = true
    queueMicrotask(() => {
      if (!live) return
      const { arrive } = useFind.getState()
      setFind(editor, re, 0)
      if (arrive) {
        useFind.getState().set({ arrive: null })
        const count = findState(editor).matches.length
        if (count) pick(editor, re, arrive === 'last' ? count - 1 : 0)
      }
    })
    return () => {
      live = false
    }
  }, [editor, re])
  // Gone: no highlights left behind.
  useEffect(() => () => queueMicrotask(() => setFind(editor, null, -1)), [editor])

  // The field asked for gets the cursor.
  useEffect(() => {
    const input = f.focus.field === 'replace' ? replaceInput.current : findInput.current
    input?.focus()
    input?.select()
  }, [f.focus])

  /** Into another chapter, at its first (or last) match. */
  const toChapter = (id: string, arrive: 'first' | 'last') => {
    useFind.getState().set({ arrive })
    navigate(`/write/${id}`)
  }

  const step = (by: 1 | -1) => {
    const { matches, current } = findState(editor)
    const i = current + by
    if (i >= 0 && i < matches.length) return go(i)
    if (f.scope === 'all' && elsewhere.length) {
      // On to the next chapter with matches (round to the first again after the last).
      const ahead = by === 1 ? elsewhere.find((x) => x.i > index) ?? elsewhere[0] : [...elsewhere].reverse().find((x) => x.i < index) ?? elsewhere[elsewhere.length - 1]
      return toChapter(ahead.c.id, by === 1 ? 'first' : 'last')
    }
    if (matches.length) go(by === 1 ? 0 : matches.length - 1)
  }

  const replaceOne = () => {
    const { matches, current } = findState(editor)
    const m = matches[current]
    if (!m) return step(1)
    const tr = editor.state.tr
    if (f.replacement) tr.insertText(f.replacement, m.from, m.to)
    else tr.delete(m.from, m.to)
    editor.view.dispatch(tr)
    // On to the next, after what was put in (which might match too).
    const after = m.from + f.replacement.length
    const next = findState(editor).matches.findIndex((x) => x.from >= after)
    if (next >= 0) go(next)
    else if (f.scope === 'all' && elsewhere.length) step(1)
    else setFind(editor, re, 0)
  }

  const replaceAll = () => {
    if (!re) return
    if (f.scope === 'chapter') {
      const { matches } = findState(editor)
      if (!matches.length) return
      const tr = editor.state.tr
      for (const m of [...matches].reverse()) {
        if (f.replacement) tr.insertText(f.replacement, m.from, m.to)
        else tr.delete(m.from, m.to)
      }
      editor.view.dispatch(tr)
      f.set({ notice: { text: `Replaced ${times(matches.length)} in this chapter.`, step: null } })
      return
    }
    // Every chapter at once, this one's latest typing saved first: one step to undo.
    flush()
    const done = replaceText(query, f.replacement)
    if (done.count) {
      const step = useHistory.getState().past.at(-1) ?? null
      f.set({ notice: { text: `Replaced ${times(done.count)} in ${done.chapters} chapter${done.chapters === 1 ? '' : 's'}.`, step } })
    }
  }

  const close = () => {
    f.close()
    editor.commands.focus()
  }

  // Names linked with @ aren't text: say so when the query is in one.
  const inNames = useMemo(() => {
    if (!re) return []
    const once = new RegExp(re.source, re.flags.replace('g', ''))
    return named.filter((n) => once.test(displayName(n))).slice(0, 2)
  }, [re, named])
  const total = here.count + (f.scope === 'all' ? elsewhereTotal : 0)
  const canReplace = f.scope === 'all' ? total > 0 : here.count > 0
  const shown = elsewhere.slice(0, 5)

  return (
    <div className="find-panel" role="search" aria-label="Find and replace in the manuscript">
      <div className="find-row">
        <label className="find-field">
          <Search size={15} aria-hidden />
          <input
            ref={findInput}
            value={f.text}
            onChange={(e) => f.set({ text: e.target.value })}
            placeholder="Find"
            aria-label="Find"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                step(e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
          />
        </label>
        <button
          type="button"
          className={`find-toggle${f.matchCase ? ' on' : ''}`}
          aria-pressed={f.matchCase}
          onClick={() => f.set({ matchCase: !f.matchCase })}
          title="Match case"
          aria-label="Match case"
        >
          <CaseSensitive size={17} />
        </button>
        <button
          type="button"
          className={`find-toggle${f.wholeWord ? ' on' : ''}`}
          aria-pressed={f.wholeWord}
          onClick={() => f.set({ wholeWord: !f.wholeWord })}
          title="Whole words only"
          aria-label="Whole words only"
        >
          <WholeWord size={17} />
        </button>
        <span className="find-count" aria-live="polite">
          {!f.text ? '' : here.count ? `${here.current + 1} of ${here.count}` : 'None here'}
        </span>
        <button type="button" className="find-toggle" onClick={() => step(-1)} disabled={!total} title="Previous (Shift+Enter)" aria-label="Previous match">
          <ArrowUp size={16} />
        </button>
        <button type="button" className="find-toggle" onClick={() => step(1)} disabled={!total} title="Next (Enter)" aria-label="Next match">
          <ArrowDown size={16} />
        </button>
        <button type="button" className="find-toggle" onClick={close} title="Close (Esc)" aria-label="Close find and replace">
          <X size={16} />
        </button>
      </div>
      <div className="find-row">
        <label className="find-field">
          <Replace size={15} aria-hidden />
          <input
            ref={replaceInput}
            value={f.replacement}
            onChange={(e) => f.set({ replacement: e.target.value })}
            placeholder="Replace with"
            aria-label="Replace with"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                replaceAll()
              } else if (e.key === 'Enter') {
                e.preventDefault()
                replaceOne()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
          />
        </label>
        <button type="button" className="btn ghost small" onClick={replaceOne} disabled={!here.count} title="Replace this one, and go to the next (Enter)">
          Replace
        </button>
        <button type="button" className="btn ghost small" onClick={replaceAll} disabled={!canReplace} title={`Replace every one ${f.scope === 'all' ? 'in every chapter' : 'in this chapter'} (${mod}Enter)`}>
          Replace all
        </button>
      </div>
      <div className="find-scope-row">
        <div className="find-scope" role="radiogroup" aria-label="Where">
          {SCOPES.map((s) => (
            <button
              key={s.scope}
              type="button"
              role="radio"
              aria-checked={f.scope === s.scope}
              className={`find-scope-btn${f.scope === s.scope ? ' on' : ''}`}
              onClick={() => f.set({ scope: s.scope })}
            >
              {s.label}
            </button>
          ))}
        </div>
        {f.text && elsewhereTotal > 0 && (
          <span className="find-elsewhere">
            {times(elsewhereTotal)} in {elsewhere.length} other chapter{elsewhere.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {f.scope === 'all' && shown.length > 0 && (
        <ul className="find-chapters">
          {shown.map(({ c, i, count }) => (
            <li key={c.id}>
              <button type="button" onClick={() => toChapter(c.id, 'first')}>
                <span className="find-chapter-name">
                  Chapter {i + 1}
                  {c.title ? `: ${plainText(c.title, lookup)}` : ''}
                </span>
                <span className="find-chapter-count">{count}</span>
              </button>
            </li>
          ))}
          {elsewhere.length > shown.length && <li className="muted">and {elsewhere.length - shown.length} more</li>}
        </ul>
      )}
      {f.notice && (
        <p className="find-notice" role="status">
          {f.notice.text}{' '}
          {!f.notice.step ? (
            <span className="muted">{mod}Z undoes it.</span>
          ) : latest === f.notice.step ? (
            <button
              type="button"
              className="find-undo"
              onClick={() => {
                useStory.getState().undo()
                f.set({ notice: null })
              }}
            >
              Undo
            </button>
          ) : null}
        </p>
      )}
      {inNames.length > 0 && (
        <p className="find-hint">
          {inNames.map((n) => `“${displayName(n)}”`).join(' and ')} {inNames.length === 1 ? 'is a name' : 'are names'} linked with @: those change when
          you rename {inNames.length === 1 ? 'it' : 'them'}, not here.
        </p>
      )}
    </div>
  )
}
