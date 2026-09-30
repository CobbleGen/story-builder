import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { MapPinPlus, UserPlus } from 'lucide-react'
import {
  activeQuery,
  applyTextEdit,
  displayName,
  linkTyped,
  matchesName,
  mentionToken,
  parseMentions,
  replaceRange,
  toDisplay,
  type Mentionable,
  type Segment,
} from '../lib/mentions'
import { createMentioned, type NewMentioned } from '../lib/newMentioned'
import { useMentionables, useMentionLookup } from '../store/storyStore'
import { MentionName } from './MentionText'
import { MentionBadge } from './ElementIcon'

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'className' | 'onSubmit'> & {
  /** Stored text (mentions as tokens). */
  value: string
  onChange: (value: string) => void
  ref?: Ref<HTMLTextAreaElement>
  /** Look of the field; applied to the wrapper. */
  className?: string
  /** Enter blurs (or calls onSubmit) instead of adding a newline; Shift+Enter still adds one. */
  submitOnEnter?: boolean
  /** Called on Enter with the field's final value (any typed @Name already linked). */
  onSubmit?: (value: string) => void
  /** Plain text: no mentions or suggestions. */
  plain?: boolean
}

type Option = { kind: 'item'; item: Mentionable } | { kind: 'create'; what: NewMentioned; name: string }
type Query = { start: number; query: string }

const MAX_SUGGESTIONS = 6
const NEW_NAME_RE = /^[\p{L}\p{N}_'’-]+$/u

/**
 * A growing text field that understands mentions: typing `@` suggests
 * characters, places and things, and a mention shows as the name in its color.
 * The colored text is drawn in a layer behind a transparent textarea, so
 * native editing, selection and undo keep working; edits are mapped back
 * onto the stored text so mentions survive typing around them.
 */
export function MentionTextarea({
  value,
  onChange,
  ref,
  className,
  submitOnEnter,
  onSubmit,
  plain,
  onKeyDown,
  onBlur,
  onFocus,
  ...rest
}: Props) {
  const named = useMentionables()
  const lookup = useMentionLookup()
  const inner = useRef<HTMLTextAreaElement>(null)
  const marker = useRef<HTMLSpanElement>(null)
  const pendingCaret = useRef<number | null>(null)
  // The latest stored value, including changes the parent hasn't rendered yet.
  const latest = useRef(value)
  useLayoutEffect(() => {
    latest.current = value
  }, [value])
  const listId = useId()
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState<Query | null>(null)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  useImperativeHandle(ref, () => inner.current!, [])

  const display = plain ? value : toDisplay(value, lookup)
  const segments: Segment[] = plain ? [{ kind: 'text', text: value }] : parseMentions(value, lookup)

  /** The `@name` being typed at the caret, while it can still become a mention. */
  const liveQuery = (text: string, caret: number): Query | null => {
    const q = activeQuery(text, caret)
    if (!q) return null
    const possible =
      q.query === '' ||
      named.some((c) => matchesName(c, q.query)) ||
      NEW_NAME_RE.test(q.query)
    return possible ? q : null
  }

  let options: Option[] = []
  if (query && !plain) {
    const q = query.query.toLowerCase()
    const found = named.filter((c) => matchesName(c, query.query))
    const exact = found.find((c) => displayName(c).toLowerCase() === q)
    options = (exact ? [exact, ...found.filter((c) => c !== exact)] : found)
      .slice(0, MAX_SUGGESTIONS)
      .map((item) => ({ kind: 'item' as const, item }))
    if (query.query && !exact && NEW_NAME_RE.test(query.query)) {
      options.push({ kind: 'create', what: 'character', name: query.query }, { kind: 'create', what: 'place', name: query.query })
    }
  }
  const open = focused && options.length > 0
  const activeIndex = Math.min(active, Math.max(0, options.length - 1))

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && inner.current && document.activeElement === inner.current) {
      inner.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
    }
    pendingCaret.current = null
  })

  // Place the suggestion list under the `@` being typed.
  useLayoutEffect(() => {
    if (!open || !marker.current) return
    const r = marker.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.left - 4, window.innerWidth - 268))
    const next =
      r.bottom + 240 > window.innerHeight ? { left, bottom: window.innerHeight - r.top + 4 } : { left, top: r.bottom + 4 }
    setPos((prev) =>
      prev && prev.left === next.left && prev.top === next.top && prev.bottom === next.bottom ? prev : next,
    )
  }, [open, query, display])

  const commit = (stored: string, caret?: number) => {
    if (caret !== undefined && toDisplay(stored, lookup) !== inner.current?.value) pendingCaret.current = caret
    latest.current = stored
    if (stored !== value) onChange(stored)
  }

  const setQueryIfChanged = (q: Query | null) => {
    if (q?.start !== query?.start || q?.query !== query?.query) {
      setQuery(q)
      setActive(0)
    }
  }

  /** Links every finished @Name, e.g. when leaving the field or submitting. */
  const linkAll = () => {
    const linked = linkTyped(latest.current, named, lookup).stored
    if (linked !== latest.current) commit(linked)
    return linked
  }

  const handleChange = (el: HTMLTextAreaElement) => {
    if (plain) {
      onChange(el.value)
      return
    }
    const caret = el.selectionStart
    const q = liveQuery(el.value, caret)
    const result = applyTextEdit(latest.current, named, lookup, el.value, caret, q?.start ?? null)
    commit(result.stored, result.caret)
    setQueryIfChanged(liveQuery(toDisplay(result.stored, lookup), result.caret))
  }

  const handleSelect = (el: HTMLTextAreaElement) => {
    if (plain) return
    if (el.selectionStart !== el.selectionEnd) {
      setQueryIfChanged(null)
      return
    }
    // Only act on what the field shows now; skip if a change is still in flight.
    if (toDisplay(latest.current, lookup) !== el.value) return
    const caret = el.selectionStart
    const q = liveQuery(el.value, caret)
    setQueryIfChanged(q)
    // Moving away from a finished @Name turns it into a mention.
    const result = linkTyped(latest.current, named, lookup, { skipAt: q?.start ?? null, caret })
    if (result.stored !== latest.current) commit(result.stored, result.caret)
  }

  const choose = (option: Option) => {
    const el = inner.current
    if (!el || !query) return
    const name = option.kind === 'create' ? option.name : displayName(option.item)
    const id = option.kind === 'create' ? createMentioned(option.what, name) : option.item.id
    const caret = el.selectionStart
    const after = el.value.slice(caret)
    const spacer = /^\s/.test(after) ? '' : ' '
    const stored = replaceRange(latest.current, lookup, query.start, caret, mentionToken(id) + spacer)
    setQuery(null)
    pendingCaret.current = query.start + name.length + 1
    latest.current = stored
    onChange(stored)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setActive((activeIndex + step + options.length) % options.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        choose(options[activeIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setQuery(null)
        return
      }
    }
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    if (submitOnEnter && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (onSubmit) onSubmit(plain ? latest.current : linkAll())
      else e.currentTarget.blur()
    } else if (e.key === 'Escape' && !onSubmit) {
      e.currentTarget.blur()
    }
  }

  // The backdrop mirrors the textarea's text exactly, plus a marker at the `@`.
  const backdrop: ReactNode[] = []
  let offset = 0
  const markAt = open && query ? query.start : -1
  segments.forEach((s, i) => {
    const end = offset + s.text.length
    if (s.kind === 'text') {
      if (markAt >= offset && markAt < end) {
        backdrop.push(s.text.slice(0, markAt - offset), <span key="marker" ref={marker} />, s.text.slice(markAt - offset))
      } else {
        backdrop.push(s.text)
      }
    } else {
      if (markAt === offset) backdrop.push(<span key="marker" ref={marker} />)
      backdrop.push(<MentionName key={i} segment={s} />)
    }
    offset = end
  })
  if (markAt === offset && markAt >= 0) backdrop.push(<span key="marker" ref={marker} />)

  return (
    <div className={`mention-field${className ? ` ${className}` : ''}`}>
      <div className="mention-backdrop" aria-hidden>
        {backdrop}
        {'​'}
      </div>
      <textarea
        ref={inner}
        rows={1}
        {...rest}
        className="mention-input"
        value={display}
        role={plain ? undefined : 'combobox'}
        aria-autocomplete={plain ? undefined : 'list'}
        aria-expanded={plain ? undefined : open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        onChange={(e) => handleChange(e.target)}
        onSelect={(e) => handleSelect(e.currentTarget)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          setQuery(null)
          if (!plain) linkAll()
          onBlur?.(e)
        }}
      />
      {open &&
        pos &&
        createPortal(
          <div id={listId} className="mention-popup" role="listbox" style={pos}>
            {options.map((option, i) => (
              <div
                key={option.kind === 'create' ? `create-${option.what}` : option.item.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={`mention-option${i === activeIndex ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(option)}
              >
                {option.kind === 'item' ? (
                  <>
                    <MentionBadge item={option.item} size="sm" />
                    <span className="mention-option-name">{displayName(option.item)}</span>
                  </>
                ) : (
                  <>
                    <span className="avatar avatar-sm avatar-new">
                      {option.what === 'character' ? <UserPlus size={12} /> : <MapPinPlus size={12} />}
                    </span>
                    <span className="mention-option-name">
                      New {option.what} “{option.name}”
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
