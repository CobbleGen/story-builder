import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Check, ChevronLeft, ChevronRight, PenLine, Plus } from 'lucide-react'
import type { Beat, Character, RichNode } from '../types'
import { chapterNumbers, useCharacterLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { displayName, mentions, plainText } from '../lib/mentions'
import { MentionText } from '../components/MentionText'
import { MentionTextarea } from '../components/MentionTextarea'
import { ArcPicker } from '../components/ArcPicker'
import { ChapterTag } from '../components/ChapterTag'
import { RichView } from './RichView'
import { paginate, type PageBlock } from './pages'
import { measurePages } from './measurePages'
import { DRAG_MIME, focusSoon } from './mapShared'

// How many words a page holds follows the size of the paper, so a bigger card
// shows more of the chapter at once. Tuned by measuring the page's type.
const WORDS_PER_SQUARE_PX = 130 / (272 * 290)
/** Room the chapter heading takes at the top of the first page. */
const HEADING_PX = 76
/** The text area of the paper at the card's standard size. */
const STANDARD_PAPER = { width: 272, height: 290 }

/** Room left under the last line, so rounding never tips a page into scrolling. */
const FIT_SLACK = 3

/** Changes when web fonts finish loading, since text then takes a different amount of room. */
function useFontsLoaded(): number {
  const [loads, setLoads] = useState(0)
  useEffect(() => {
    const fonts = document.fonts
    if (!fonts) return
    const again = () => setLoads((n) => n + 1)
    fonts.addEventListener('loadingdone', again)
    void fonts.ready.then(again)
    return () => fonts.removeEventListener('loadingdone', again)
  }, [])
  return loads
}

/** The size of the paper's text area (inside its padding), as it changes. */
function usePaperSize(ref: RefObject<HTMLElement | null>, doc: RichNode | undefined) {
  const [size, setSize] = useState(STANDARD_PAPER)
  const hasPaper = !!doc
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const px = (v: string) => parseFloat(v) || 0
      // offsetWidth, not clientWidth: a scrollbar appearing mustn't change the page size.
      const width = Math.round(el.offsetWidth - px(cs.paddingLeft) - px(cs.paddingRight) - px(cs.borderLeftWidth) - px(cs.borderRightWidth))
      const height = Math.round(el.offsetHeight - px(cs.paddingTop) - px(cs.paddingBottom) - px(cs.borderTopWidth) - px(cs.borderBottomWidth))
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, hasPaper])
  return size
}

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
  const characters = useStory((s) => s.characters)
  const paper = useRef<HTMLDivElement>(null)
  const measureHead = useRef<HTMLDivElement>(null)
  const measureText = useRef<HTMLDivElement>(null)
  const size = usePaperSize(paper, doc)
  const fonts = useFontsLoaded()

  // A quick estimate by word count, replaced before it's seen by pages
  // measured in a hidden copy of the paper.
  const perPage = Math.max(30, Math.round(size.width * size.height * WORDS_PER_SQUARE_PX))
  const firstPage = Math.max(15, Math.round(size.width * (size.height - HEADING_PX) * WORDS_PER_SQUARE_PX))
  const estimate = useMemo(() => paginate(doc, perPage, firstPage), [doc, perPage, firstPage])
  const [measured, setMeasured] = useState<PageBlock[][] | null>(null)
  const measuredFor = useRef<unknown[] | null>(null)

  useLayoutEffect(() => {
    const head = measureHead.current
    const host = measureText.current
    if (!doc || !head || !host) return
    const run = () => {
      const cs = getComputedStyle(head)
      const headRoom = head.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0)
      const name = (id: string) => {
        const c = characters.find((ch) => ch.id === id)
        return c ? displayName(c) : 'unknown character'
      }
      setMeasured(measurePages(doc, host, { first: size.height - headRoom - FIT_SLACK, rest: size.height - FIT_SLACK }, name))
    }
    // New text lays out straight away; while a card is being resized, wait for a pause.
    const prev = measuredFor.current
    measuredFor.current = [doc, characters, title]
    if (!prev || prev[0] !== doc || prev[1] !== characters || prev[2] !== title) return run()
    const timer = setTimeout(run, 120)
    return () => clearTimeout(timer)
  }, [doc, characters, title, size, fonts])

  const pages = doc ? (measured ?? estimate) : []
  const [page, setPage] = useState(0)
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
        <RichView blocks={pages[at]} first={at === 0} />
      </div>
      <div className="map-paper map-measure" style={{ width: size.width }} aria-hidden>
        <div ref={measureHead} className="map-paper-head">
          <span>Chapter {number}</span>
          <strong>
            <MentionText text={title} fallback="Untitled chapter" />
          </strong>
        </div>
        <div ref={measureText} className="map-rich" />
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

// ---------- A character's details ----------

/** Everything about a character: their attributes in full, arcs, chapters and beats. */
export function CharacterDetails({ character }: { character: Character }) {
  const arcs = useStory((s) => s.arcs)
  const chapters = useStory((s) => s.chapters)
  const beats = useStory((s) => s.beats)
  const openBeat = useUi((s) => s.openBeat)
  const scroller = useRef<HTMLDivElement>(null)
  const scrolls = useScrolls(scroller)
  const numbers = chapterNumbers(chapters)
  const attributes = character.attributes.filter((a) => a.label || a.value)
  const inArcs = arcs.filter((a) => a.characterIds.includes(character.id))
  const pov = chapters.filter((c) => c.povCharacterId === character.id)
  const inBeats = arcs.flatMap((a) =>
    a.beatIds
      .map((id) => beats[id])
      .filter((b): b is Beat => !!b && (mentions(b.title, character.id) || mentions(b.description, character.id))),
  )
  const colorOf = (arcId: string) => arcs.find((a) => a.id === arcId)?.color

  return (
    <div ref={scroller} className={`map-panel map-details nodrag${scrolls ? ' nowheel' : ''}`}>
      <section>
        <h4>Attributes</h4>
        {attributes.length ? (
          <dl className="map-attr-list">
            {attributes.map((a) => (
              <div key={a.id}>
                <dt>{a.label || 'Note'}</dt>
                <dd>
                  <MentionText text={a.value} fallback="–" />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="map-details-empty">None yet. Add some on their page.</p>
        )}
      </section>
      {inArcs.length > 0 && (
        <section>
          <h4>Arcs</h4>
          <ul className="map-chips">
            {inArcs.map((a) => (
              <li key={a.id} style={{ '--arc': a.color } as React.CSSProperties}>
                <span className="arc-dot" />
                <span className="map-chip-text">
                  <MentionText text={a.name} fallback="Untitled arc" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {pov.length > 0 && (
        <section>
          <h4>Point of view in</h4>
          <ul className="map-chips">
            {pov.map((c) => (
              <li key={c.id}>
                <span className="map-chip-num">{numbers[c.id]}</span>
                <span className="map-chip-text">
                  <MentionText text={c.title} fallback="Untitled chapter" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {inBeats.length > 0 && (
        <section>
          <h4>In {inBeats.length === 1 ? 'one beat' : `${inBeats.length} beats`}</h4>
          <ol className="map-beat-list">
            {inBeats.map((b) => (
              <li key={b.id} className="map-beat" style={{ '--arc': colorOf(b.arcId) } as React.CSSProperties}>
                {b.chapterId && <ChapterTag number={numbers[b.chapterId]} />}
                <button type="button" className="map-beat-title" onClick={() => openBeat(b.id)}>
                  <MentionText text={b.title} fallback={<span className="muted">Untitled beat</span>} />
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
