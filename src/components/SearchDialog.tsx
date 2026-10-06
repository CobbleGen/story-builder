import { useDeferredValue, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { FileText, Network, Search, SquareDashed, StickyNote, Type, X } from 'lucide-react'
import { chapterNumbers, useMentionLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { plainText } from '../lib/mentions'
import {
  MAX_TEXT_HITS,
  buildIndex,
  parseQuery,
  search,
  type Hit,
  type HitGroup,
  type HitKind,
  type Marked,
  type TextFind,
} from '../lib/search'
import { SEARCH_KEYS } from '../lib/searchShortcut'
import { CharacterAvatar } from './CharacterAvatar'
import { ElementIcon } from './ElementIcon'
import { ChapterTag } from './ChapterTag'

/** Hits shown per group before "Show more", and when only one kind of thing matched. */
const PER_GROUP = 5
const ONLY_GROUP = 30

type Row = { type: 'hit'; hit: Hit } | { type: 'more'; kind: HitKind; count: number }

/** Search the whole story from anywhere (Ctrl/⌘+K), and jump to what's found. */
export function SearchDialog() {
  const setOpen = useUi((s) => s.setSearchOpen)
  const openBeat = useUi((s) => s.openBeat)
  const setProgressOpen = useUi((s) => s.setProgressOpen)
  const navigate = useNavigate()
  const chapters = useStory((s) => s.chapters)
  const texts = useStory((s) => s.texts)
  const beats = useStory((s) => s.beats)
  const arcs = useStory((s) => s.arcs)
  const characters = useStory((s) => s.characters)
  const elements = useStory((s) => s.elements)
  const mindMaps = useStory((s) => s.mindMaps)
  const lookup = useMentionLookup()
  const index = useMemo(
    () => buildIndex({ chapters, texts, beats, arcs, characters, elements, mindMaps }, lookup),
    [chapters, texts, beats, arcs, characters, elements, mindMaps, lookup],
  )
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const groups = useMemo(() => search(index, deferred), [index, deferred])
  const [expanded, setExpanded] = useState<Set<HitKind>>(new Set())
  const [active, setActive] = useState(0)
  // A new query starts at the top, with every group short again.
  const [shownFor, setShownFor] = useState(deferred)
  if (shownFor !== deferred) {
    setShownFor(deferred)
    setActive(0)
    setExpanded(new Set())
  }
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const optionId = (i: number) => `${listId}-${i}`

  // Where focus was, to go back to when closing without opening anything.
  const [returnTo] = useState(() => document.activeElement as HTMLElement | null)
  const close = (restore = true) => {
    setOpen(false)
    if (restore && returnTo?.isConnected) returnTo.focus({ preventScroll: true })
  }

  const rows: Row[] = []
  const shownIn = new Map<HitKind, Row[]>()
  for (const g of groups) {
    const limit = expanded.has(g.kind) ? Infinity : groups.length === 1 ? ONLY_GROUP : PER_GROUP
    const list: Row[] = g.hits.slice(0, limit).map((hit) => ({ type: 'hit', hit }))
    if (g.hits.length > limit) list.push({ type: 'more', kind: g.kind, count: g.hits.length - limit })
    shownIn.set(g.kind, list)
    rows.push(...list)
  }
  const activeIndex = Math.min(active, Math.max(0, rows.length - 1))

  useLayoutEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [listId, activeIndex, deferred])

  const pick = (row: Row) => {
    if (row.type === 'more') {
      const first = rows.indexOf(row)
      setExpanded((prev) => new Set(prev).add(row.kind))
      setActive(first)
      input.current?.focus()
      return
    }
    const { hit } = row
    const terms = parseQuery(deferred)
    close(false)
    // Whatever was open underneath gives way to what was found.
    openBeat(null)
    setProgressOpen(false)
    switch (hit.kind) {
      case 'chapter':
        navigate('/', { state: { focusChapter: hit.id } })
        break
      case 'text':
        navigate(`/write/${hit.id}`, { state: { find: { block: hit.block ?? 0, terms } satisfies TextFind } })
        break
      case 'beat':
        openBeat(hit.id)
        break
      case 'arc':
        navigate(`/arcs/${hit.id}`)
        break
      case 'character':
        navigate(`/characters/${hit.id}`)
        break
      case 'element':
        navigate(`/elements/${hit.id}`)
        break
      case 'note':
        navigate(`/map/${hit.mapId}`, { state: { focusNode: hit.id } })
        break
      case 'map':
        navigate(`/map/${hit.id}`)
        break
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!rows.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((activeIndex + step + rows.length) % rows.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rows[activeIndex]) pick(rows[activeIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // Only this dialog closes, not one underneath it.
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      // Everything here is done from the search field.
      e.preventDefault()
    }
  }

  const total = groups.reduce((n, g) => n + g.hits.length, 0)
  const searching = parseQuery(deferred).length > 0

  return createPortal(
    <div className="modal-backdrop search-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="search-dialog" role="dialog" aria-modal="true" aria-label="Search your story">
        <div className="search-field">
          <Search size={18} aria-hidden />
          <input
            ref={input}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search your story"
            aria-label="Search your story"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-activedescendant={rows.length ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button
              className="icon-btn"
              onClick={() => {
                setQuery('')
                input.current?.focus()
              }}
              aria-label="Clear search"
              title="Clear"
            >
              <X size={16} />
            </button>
          ) : (
            <kbd className="search-kbd">{SEARCH_KEYS}</kbd>
          )}
        </div>
        <div className="search-results" id={listId} role="listbox" aria-label="Results">
          {groups.map((g) => (
            <Group key={g.kind} group={g}>
              {shownIn.get(g.kind)!.map((row) => {
                const i = rows.indexOf(row)
                return (
                  <div
                    key={row.type === 'hit' ? row.hit.key : `more-${row.kind}`}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={`search-row${row.type === 'more' ? ' more' : ''}${i === activeIndex ? ' active' : ''}`}
                    onMouseMove={() => i !== activeIndex && setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(row)}
                  >
                    {row.type === 'hit' ? <HitRow hit={row.hit} /> : <span>Show {row.count} more</span>}
                  </div>
                )
              })}
            </Group>
          ))}
          {!searching && (
            <p className="search-hint">
              Find anything: chapters and what’s written in them, beats, characters, places, arcs and mind map notes.
            </p>
          )}
          {searching && total === 0 && deferred === query && (
            <p className="search-hint">Nothing matches “{query.trim()}”.</p>
          )}
        </div>
        <div className="search-foot" aria-hidden>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to open
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
        </div>
        <span className="sr-only" role="status">
          {searching ? `${total} result${total === 1 ? '' : 's'}` : ''}
        </span>
      </div>
    </div>,
    document.body,
  )
}

function Group({ group, children }: { group: HitGroup; children: ReactNode }) {
  const id = useId()
  const count = group.kind === 'text' && group.hits.length >= MAX_TEXT_HITS ? `${MAX_TEXT_HITS}+` : String(group.hits.length)
  return (
    <div role="group" aria-labelledby={id} className="search-group">
      <div id={id} className="search-group-head">
        {group.label}
        <span className="search-group-count">{count}</span>
      </div>
      {children}
    </div>
  )
}

/** Text with the matched stretches highlighted. */
function MarkedText({ value }: { value: Marked }) {
  const out: ReactNode[] = []
  let at = 0
  value.marks.forEach(([s, e], i) => {
    if (s > at) out.push(value.text.slice(at, s))
    out.push(<mark key={i}>{value.text.slice(s, e)}</mark>)
    at = e
  })
  if (at < value.text.length) out.push(value.text.slice(at))
  return <>{out}</>
}

const FALLBACK: Partial<Record<HitKind, string>> = {
  chapter: 'Untitled chapter',
  beat: 'Untitled beat',
  arc: 'Untitled arc',
}

function HitRow({ hit }: { hit: Hit }) {
  const chapters = useStory((s) => s.chapters)
  const beat = useStory((s) => (hit.kind === 'beat' ? s.beats[hit.id] : undefined))
  const arc = useStory((s) =>
    hit.kind === 'arc' ? s.arcs.find((a) => a.id === hit.id) : beat ? s.arcs.find((a) => a.id === beat.arcId) : undefined,
  )
  const character = useStory((s) => (hit.kind === 'character' ? s.characters.find((c) => c.id === hit.id) : undefined))
  const element = useStory((s) => (hit.kind === 'element' ? s.elements.find((e) => e.id === hit.id) : undefined))
  const note = useStory((s) =>
    hit.kind === 'note' ? s.mindMaps.find((m) => m.id === hit.mapId)?.nodes.find((n) => n.id === hit.id) : undefined,
  )
  const lookup = useMentionLookup()
  const numbers = chapterNumbers(chapters)

  let icon: ReactNode = null
  if (hit.kind === 'chapter' || hit.kind === 'text') icon = hit.kind === 'chapter' ? <ChapterTag number={numbers[hit.id]} /> : <FileText size={16} />
  else if (hit.kind === 'beat') icon = <ChapterTag number={beat?.chapterId ? numbers[beat.chapterId] : null} />
  else if (hit.kind === 'arc') icon = <span className="arc-dot" />
  else if (character) icon = <CharacterAvatar character={character} size="sm" />
  else if (element) icon = <ElementIcon element={element} size="sm" />
  else if (hit.kind === 'note') icon = note?.kind === 'text' ? <Type size={16} /> : note?.kind === 'container' ? <SquareDashed size={16} /> : <StickyNote size={16} />
  else if (hit.kind === 'map') icon = <Network size={16} />

  // Paragraphs and notes lead with the matched text; where they are comes second.
  const textFirst = hit.kind === 'text' || hit.kind === 'note'
  const main = textFirst ? hit.snippet : hit.title
  const sub = textFirst ? { text: hit.kind === 'note' ? `On the map “${hit.title.text}”` : hit.title.text, marks: [] } : hit.snippet

  return (
    <>
      <span className="search-icon" style={arc ? ({ '--arc': arc.color } as React.CSSProperties) : undefined}>
        {icon}
      </span>
      <span className={`search-text${textFirst ? ' lead-text' : ''}`}>
        <span className="search-title">
          {main && main.text ? <MarkedText value={main} /> : <span className="muted">{FALLBACK[hit.kind] ?? 'Untitled'}</span>}
        </span>
        {sub && sub.text && (
          <span className="search-sub">
            {!textFirst && hit.snippetLabel && <span className="search-sub-label">{hit.snippetLabel}: </span>}
            <MarkedText value={sub} />
          </span>
        )}
      </span>
      {beat && arc?.name && <span className="search-meta">{plainText(arc.name, lookup)}</span>}
    </>
  )
}
