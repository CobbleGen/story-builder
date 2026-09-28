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
import { UserPlus } from 'lucide-react'
import type { Character } from '../types'
import { activeQuery, displayName, parseMentions, toDisplay, toStored, type Segment } from '../lib/mentions'
import { nextArcColor } from '../lib/colors'
import { useCharacterLookup, useStory } from '../store/storyStore'
import { MentionChip } from './MentionText'
import { CharacterAvatar } from './CharacterAvatar'

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'className'> & {
  /** Stored text (mentions as tokens). */
  value: string
  onChange: (value: string) => void
  ref?: Ref<HTMLTextAreaElement>
  /** Look of the field; applied to the wrapper. */
  className?: string
  /** Enter blurs (or calls onSubmit) instead of adding a newline; Shift+Enter still adds one. */
  submitOnEnter?: boolean
  onSubmit?: () => void
  /** Plain text: no mentions or suggestions. */
  plain?: boolean
}

type Option = { kind: 'character'; character: Character } | { kind: 'create'; name: string }

const MAX_SUGGESTIONS = 6

function matches(character: Character, query: string): boolean {
  const name = displayName(character).toLowerCase()
  const q = query.toLowerCase()
  if (/\s/.test(q)) return name.startsWith(q)
  return name.startsWith(q) || name.split(/\s+/).some((word) => word.startsWith(q))
}

/**
 * A growing text field that understands `@` mentions: typing `@` suggests
 * characters, and mentions are highlighted in the character's color as you
 * type. The highlighted text is drawn in a layer behind a transparent
 * textarea, so native editing, selection and undo keep working.
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
  const characters = useStory((s) => s.characters)
  const addCharacter = useStory((s) => s.addCharacter)
  const lookup = useCharacterLookup()
  const inner = useRef<HTMLTextAreaElement>(null)
  const marker = useRef<HTMLSpanElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const listId = useId()
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  useImperativeHandle(ref, () => inner.current!, [])

  const display = plain ? value : toDisplay(value, lookup)
  const segments: Segment[] = plain ? [{ kind: 'text', text: value }] : parseMentions(value, lookup)

  let options: Option[] = []
  if (query && !plain) {
    const found = characters.filter((c) => matches(c, query.query))
    const exact = found.find((c) => displayName(c) === query.query)
    // Put an exact match first; hide the list when it's the only choice.
    options = (exact ? [exact, ...found.filter((c) => c !== exact)] : found)
      .slice(0, MAX_SUGGESTIONS)
      .map((character) => ({ kind: 'character' as const, character }))
    const name = query.query
    // Offer to create a character from a single typed word; longer names can be set on their page.
    if (name && !/\s/.test(name) && !characters.some((c) => displayName(c).toLowerCase() === name.toLowerCase())) {
      options.push({ kind: 'create', name })
    }
    if (exact && options.length === 1) options = []
  }
  const open = focused && options.length > 0
  const activeIndex = Math.min(active, Math.max(0, options.length - 1))

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && inner.current) {
      inner.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
      pendingCaret.current = null
    }
  })

  // Place the suggestion list under the `@` being typed.
  useLayoutEffect(() => {
    if (!open || !marker.current) return
    const r = marker.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.left - 4, window.innerWidth - 268))
    const next = r.bottom + 240 > window.innerHeight ? { left, bottom: window.innerHeight - r.top + 4 } : { left, top: r.bottom + 4 }
    setPos((prev) =>
      prev && prev.left === next.left && prev.top === next.top && prev.bottom === next.bottom ? prev : next,
    )
  }, [open, query, display])

  const refreshQuery = (el: HTMLTextAreaElement) => {
    if (plain) return
    let q = el.selectionStart === el.selectionEnd ? activeQuery(el.value, el.selectionStart) : null
    // Past a space, keep suggesting only while the text still starts a name.
    if (q && /\s/.test(q.query) && !characters.some((c) => matches(c, q!.query))) q = null
    if (q?.start !== query?.start || q?.query !== query?.query) {
      setQuery(q)
      setActive(0)
    }
  }

  const choose = (option: Option) => {
    const el = inner.current
    if (!el || !query) return
    let pool = characters
    let name: string
    if (option.kind === 'create') {
      name = option.name
      addCharacter({ name, color: nextArcColor(characters.map((c) => c.color)) })
      pool = useStory.getState().characters
    } else {
      name = displayName(option.character)
    }
    const before = display.slice(0, query.start)
    const after = display.slice(el.selectionStart)
    const inserted = `@${name}`
    const text = before + inserted + (/^\s/.test(after) ? '' : ' ') + after
    pendingCaret.current = before.length + inserted.length + 1
    setQuery(null)
    onChange(toStored(text, pool))
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
      if (onSubmit) onSubmit()
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
      backdrop.push(<MentionChip key={i} segment={s} />)
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
        onChange={(e) => {
          onChange(plain ? e.target.value : toStored(e.target.value, characters))
          refreshQuery(e.target)
        }}
        onSelect={(e) => refreshQuery(e.currentTarget)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          setQuery(null)
          onBlur?.(e)
        }}
      />
      {open &&
        pos &&
        createPortal(
          <div id={listId} className="mention-popup" role="listbox" style={pos}>
            {options.map((option, i) => (
              <div
                key={option.kind === 'create' ? 'create' : option.character.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={`mention-option${i === activeIndex ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(option)}
              >
                {option.kind === 'character' ? (
                  <>
                    <CharacterAvatar character={option.character} size="sm" />
                    <span className="mention-option-name">{displayName(option.character)}</span>
                  </>
                ) : (
                  <>
                    <span className="avatar avatar-sm avatar-new">
                      <UserPlus size={12} />
                    </span>
                    <span className="mention-option-name">
                      New character “{option.name}”
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
