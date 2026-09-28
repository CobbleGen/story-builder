import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Check, ChevronLeft, ChevronRight, PenLine, Plus } from 'lucide-react'
import type { Beat } from '../types'
import { chapterNumbers, useCharacterLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { plainText } from '../lib/mentions'
import { MentionText } from '../components/MentionText'
import { MentionTextarea } from '../components/MentionTextarea'
import { ArcPicker } from '../components/ArcPicker'
import { ChapterTag } from '../components/ChapterTag'
import { RichView } from './RichView'
import { paginate, WORDS_PER_PAGE } from './pages'
import { DRAG_MIME, focusSoon } from './mapShared'

/** The first page also carries the chapter heading. */
const FIRST_PAGE_WORDS = WORDS_PER_PAGE - 30

/**
 * Whether an element has more content than fits, so it scrolls. Only then
 * does it take the mouse wheel (`nowheel`); otherwise the wheel zooms the map.
 */
function useScrolls(ref: RefObject<HTMLElement | null>): boolean {
  const [scrolls, setScrolls] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    const content = new MutationObserver(check)
    content.observe(el, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      content.disconnect()
    }
  }, [ref])
  return scrolls
}

// ---------- A chapter's pages ----------

interface PagesProps {
  chapterId: string
  number: number
  title: string
  onWrite: () => void
}

/** The chapter's text a page at a time, with arrows and a page picker. */
export function ChapterPages({ chapterId, number, title, onWrite }: PagesProps) {
  const doc = useStory((s) => s.texts[chapterId]?.doc)
  const pages = useMemo(() => paginate(doc, WORDS_PER_PAGE, FIRST_PAGE_WORDS), [doc])
  const [page, setPage] = useState(0)
  const paper = useRef<HTMLDivElement>(null)
  const scrolls = useScrolls(paper)
  const at = Math.max(0, Math.min(page, pages.length - 1))

  useEffect(() => {
    paper.current?.scrollTo({ top: 0 })
  }, [at])

  if (!pages.length) {
    return (
      <div className="map-panel map-pages-empty nodrag">
        <p>Nothing written in this chapter yet.</p>
        <button className="map-tool" onClick={onWrite}>
          <PenLine size={14} /> Start writing
        </button>
      </div>
    )
  }

  return (
    <div className="map-panel map-pages nodrag">
      <div ref={paper} className={`map-paper${scrolls ? ' nowheel' : ''}`}>
        {at === 0 && (
          <div className="map-paper-head">
            <span>Chapter {number}</span>
            <strong>
              <MentionText text={title} fallback="Untitled chapter" />
            </strong>
          </div>
        )}
        <RichView blocks={pages[at]} />
      </div>
      <div className="map-page-nav">
        <button
          className="map-tool icon-only"
          disabled={at === 0}
          onClick={() => setPage(at - 1)}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <label className="map-page-pick">
          Page
          <select value={at} onChange={(e) => setPage(Number(e.target.value))} aria-label="Go to page">
            {pages.map((_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
          of {pages.length}
        </label>
        <button
          className="map-tool icon-only"
          disabled={at === pages.length - 1}
          onClick={() => setPage(at + 1)}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ---------- Beats of a chapter or an arc ----------

/** Whose beats a list shows; new beats are added there. */
export type BeatScope = { kind: 'chapter'; chapterId: string } | { kind: 'arc'; arcId: string }

interface ComposerProps {
  scope: BeatScope
  /** Where the new beat goes in the chapter's or arc's order. */
  index: number
  defaultArcId: string | null
  onAdded: () => void
  onClose: () => void
}

/** Typing a new beat in place; Enter adds it and carries on with the next. */
function InlineComposer({ scope, index, defaultArcId, onAdded, onClose }: ComposerProps) {
  const arcs = useStory((s) => s.arcs)
  const addBeat = useStory((s) => s.addBeat)
  const setLastArcId = useUi((s) => s.setLastArcId)
  const [title, setTitle] = useState('')
  const [arcId, setArcId] = useState(scope.kind === 'arc' ? scope.arcId : defaultArcId)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => focusSoon(() => input.current), [])

  const submit = (text: string) => {
    const t = text.trim()
    if (!t) return onClose()
    if (!arcId) return
    if (scope.kind === 'chapter') addBeat({ arcId, title: t, chapterId: scope.chapterId, chapterIndex: index })
    else addBeat({ arcId, title: t, arcIndex: index })
    setTitle('')
    onAdded()
  }

  return (
    <li
      className="map-composer"
      style={{ '--arc': arcs.find((a) => a.id === arcId)?.color } as React.CSSProperties}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose()
      }}
    >
      <MentionTextarea
        ref={input}
        className="map-composer-input"
        value={title}
        onChange={setTitle}
        submitOnEnter
        onSubmit={submit}
        placeholder="What happens? Enter to add"
        aria-label="New beat"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      />
      {scope.kind === 'chapter' && arcs.length > 1 && (
        <ArcPicker
          arcs={arcs}
          value={arcId}
          onChange={(id) => {
            setArcId(id)
            setLastArcId(id)
            input.current?.focus()
          }}
          compact
        />
      )}
    </li>
  )
}

/** The gap between two beats; hovering it offers to add a beat right there. */
function InsertSlot({ onClick }: { onClick: () => void }) {
  return (
    <li className="map-slot" aria-hidden>
      <button tabIndex={-1} onClick={onClick} title="Add a beat here">
        <Plus size={12} strokeWidth={3} />
      </button>
    </li>
  )
}

interface RowProps {
  beat: Beat
  color: string | undefined
  chapter: number | null
  showChapter: boolean
}

function BeatRow({ beat, color, chapter, showChapter }: RowProps) {
  const updateBeat = useStory((s) => s.updateBeat)
  const openBeat = useUi((s) => s.openBeat)
  return (
    <li
      className={`map-beat${beat.done ? ' done' : ''}`}
      style={{ '--arc': color } as React.CSSProperties}
      draggable
      onDragStart={(e) => {
        // Drop it on the board to give the beat its own card.
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'beat', refId: beat.id }))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      title="Click to edit, or drag onto the map"
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={beat.done}
        aria-label={beat.done ? 'Written (click to untick)' : 'Mark as written'}
        title={beat.done ? 'Written' : 'Mark as written'}
        className={`map-check${beat.done ? ' on' : ''}`}
        onClick={() => updateBeat(beat.id, { done: !beat.done })}
      >
        {beat.done && <Check size={11} strokeWidth={3.5} />}
      </button>
      {showChapter && <ChapterTag number={chapter} />}
      <button type="button" className="map-beat-title" onClick={() => openBeat(beat.id)}>
        <MentionText text={beat.title} fallback={<span className="muted">Untitled beat</span>} />
      </button>
    </li>
  )
}

/** A chapter's or an arc's beats in order, with ways to add more in between. */
export function BeatList({ beatIds, scope }: { beatIds: string[]; scope: BeatScope }) {
  const beats = useStory((s) => s.beats)
  const arcs = useStory((s) => s.arcs)
  const chapters = useStory((s) => s.chapters)
  const lastArcId = useUi((s) => s.lastArcId)
  const lookup = useCharacterLookup()
  const [adding, setAdding] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const scrolls = useScrolls(scroller)
  const numbers = chapterNumbers(chapters)
  const colorOf = (arcId: string) => arcs.find((a) => a.id === arcId)?.color
  const canAdd = arcs.length > 0

  // A new beat in a chapter joins the arc of the beat just above it (or below).
  const defaultArc = (index: number) => {
    const near = beats[beatIds[index - 1]] ?? beats[beatIds[index]]
    if (near) return near.arcId
    return arcs.some((a) => a.id === lastArcId) ? lastArcId : (arcs[0]?.id ?? null)
  }

  const slot = (index: number) => {
    if (adding === index) {
      return (
        <InlineComposer
          key={`add-${index}`}
          scope={scope}
          index={index}
          defaultArcId={defaultArc(index)}
          onAdded={() => setAdding(index + 1)}
          onClose={() => setAdding((a) => (a === index ? null : a))}
        />
      )
    }
    return canAdd ? <InsertSlot key={`slot-${index}`} onClick={() => setAdding(index)} /> : null
  }

  const rows = beatIds.flatMap((id, index) => (beats[id] ? [{ beat: beats[id], index }] : []))
  return (
    <div ref={scroller} className={`map-panel map-beats nodrag${scrolls ? ' nowheel' : ''}`}>
      <ol className="map-beat-list" aria-label="Beats">
        {rows.map(({ beat, index }) => (
          <Fragment key={beat.id}>
            {slot(index)}
            <BeatRow
              beat={beat}
              color={colorOf(beat.arcId)}
              chapter={beat.chapterId ? numbers[beat.chapterId] : null}
              showChapter={scope.kind === 'arc'}
            />
          </Fragment>
        ))}
        {adding === beatIds.length && slot(beatIds.length)}
      </ol>
      {!rows.length && adding === null && (
        <p className="map-beats-empty">
          {canAdd ? 'No beats yet.' : 'Beats belong to an arc; create an arc first.'}
        </p>
      )}
      {canAdd && adding !== beatIds.length && (
        <button
          className="map-add-beat"
          onClick={() => setAdding(beatIds.length)}
          title={scope.kind === 'arc' ? `Add a beat to ${plainText(arcs.find((a) => a.id === scope.arcId)?.name ?? '', lookup)}` : 'Add a beat to this chapter'}
        >
          <Plus size={14} /> Add beat
        </button>
      )}
    </div>
  )
}
