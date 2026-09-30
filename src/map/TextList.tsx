import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Check, List, ListChecks, ListOrdered } from 'lucide-react'
import type { MapListStyle, MapNode } from '../types'
import { useStory } from '../store/storyStore'
import { MentionText } from '../components/MentionText'
import { MentionTextarea } from '../components/MentionTextarea'
import { insertItem, listItems, listPatch, removeItem, setItem, toggleItem, type ListState } from './listLines'
import { focusSoon } from './mapShared'

/** Sticky notes and text boxes can both be lists. */
type ListNode = Extract<MapNode, { kind: 'note' | 'text' }>

interface MarkerProps {
  style: MapListStyle
  index: number
  checked: boolean
  onToggle: () => void
}

/** A bullet, a number, or a tick box that can be clicked. */
function Marker({ style, index, checked, onToggle }: MarkerProps) {
  if (style === 'check') {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={checked ? 'Untick' : 'Tick'}
        className={`map-check nodrag${checked ? ' on' : ''}`}
        // Keep the caret where it is while typing in the list.
        onMouseDown={(e) => e.preventDefault()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={onToggle}
      >
        {checked && <Check size={11} strokeWidth={3.5} />}
      </button>
    )
  }
  return (
    <span className="map-list-marker" aria-hidden>
      {style === 'number' ? `${index + 1}.` : '•'}
    </span>
  )
}

/** A note's or text box's lines shown as a list. */
export function TextList({ node }: { node: ListNode }) {
  const updateMapNode = useStory((s) => s.updateMapNode)
  const style = node.list ?? 'bullet'
  const checked = node.checked ?? []
  return (
    <ul className={`map-list ${style}`}>
      {listItems(node.text).map((text, i) => {
        const done = style === 'check' && checked.includes(i)
        return (
          <li key={i} className={done ? 'done' : undefined}>
            <Marker
              style={style}
              index={i}
              checked={done}
              onToggle={() => updateMapNode(node.id, { checked: toggleItem(checked, i) })}
            />
            <span className="map-list-text">{text ? <MentionText text={text} /> : ' '}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Typing in a list, one field per item: Enter adds the next item, Backspace
 * in an empty one removes it, and the arrow keys move between items.
 */
export function ListEditor({ node, onDone }: { node: ListNode; onDone: () => void }) {
  const updateMapNode = useStory((s) => s.updateMapNode)
  const style = node.list ?? 'bullet'
  const items = listItems(node.text)
  const checked = node.checked ?? []
  const fields = useRef<(HTMLTextAreaElement | null)[]>([])
  // The item to put the caret in after the next render (the last one to start with).
  const pending = useRef<number | null>(items.length - 1)
  const cancelFocus = useRef(() => {})

  useEffect(() => {
    // Wait for the item's field: the list can re-render before the new text arrives.
    const i = pending.current
    if (i === null || !fields.current[i]) return
    pending.current = null
    cancelFocus.current()
    cancelFocus.current = focusSoon(() => fields.current[i] ?? null)
  })
  useEffect(() => () => cancelFocus.current(), [])

  // Read the saved list at the moment of the edit, so quick keystrokes build on each other.
  const current = (): ListState => {
    const saved = useStory.getState().mindMap.nodes.find((n) => n.id === node.id)
    return saved && (saved.kind === 'text' || saved.kind === 'note')
      ? { text: saved.text, checked: saved.checked ?? [] }
      : { text: node.text, checked }
  }
  const save = (s: ListState) => updateMapNode(node.id, { text: s.text, checked: s.checked })
  const focusItem = (i: number) => {
    const el = fields.current[i]
    if (!el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }

  // Where the caret goes is noted before saving: the save re-renders the list straight away.
  const change = (i: number, value: string) => {
    if (value.includes('\n')) pending.current = i + value.split('\n').length - 1
    save(setItem(current(), i, value))
  }
  const addAfter = (i: number, value: string) => {
    pending.current = i + 1
    save(insertItem(setItem(current(), i, value), i + 1))
  }
  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>, i: number) => {
    const el = e.currentTarget
    if (e.key === 'Backspace' && el.value === '' && items.length > 1) {
      e.preventDefault()
      // Move the caret first: the field for the last item is about to go.
      if (i > 0) focusItem(i - 1)
      else pending.current = 0
      save(removeItem(current(), i))
    } else if (e.key === 'ArrowUp' && i > 0 && el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault()
      focusItem(i - 1)
    } else if (e.key === 'ArrowDown' && i < items.length - 1 && el.selectionStart === el.value.length) {
      e.preventDefault()
      focusItem(i + 1)
    } else if (e.key === 'Escape') {
      el.blur()
    }
  }

  return (
    <ul
      className={`map-list ${style} editing nodrag nopan nowheel`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDone()
      }}
    >
      {items.map((text, i) => {
        const done = style === 'check' && checked.includes(i)
        return (
          <li key={i} className={done ? 'done' : undefined}>
            <Marker
              style={style}
              index={i}
              checked={done}
              onToggle={() => updateMapNode(node.id, { checked: toggleItem(current().checked, i) })}
            />
            <MentionTextarea
              ref={(el) => {
                fields.current[i] = el
              }}
              className="map-list-input"
              value={text}
              placeholder={items.length === 1 ? 'List item… Enter adds the next' : ''}
              aria-label={`Item ${i + 1}`}
              submitOnEnter
              onSubmit={(value) => addAfter(i, value)}
              onChange={(value) => change(i, value)}
              onKeyDown={(e) => keyDown(e, i)}
            />
          </li>
        )
      })}
    </ul>
  )
}

const LISTS: { style: MapListStyle; label: string; icon: React.ReactNode }[] = [
  { style: 'bullet', label: 'Bulleted list', icon: <List size={15} /> },
  { style: 'number', label: 'Numbered list', icon: <ListOrdered size={15} /> },
  { style: 'check', label: 'Checklist', icon: <ListChecks size={15} /> },
]

/** Toolbar buttons that turn a note or text box into a list, or back. */
export function ListButtons({ node }: { node: ListNode }) {
  const updateMapNode = useStory((s) => s.updateMapNode)
  return (
    <>
      {LISTS.map((l) => (
        <button
          key={l.style}
          className={`map-tool icon-only${node.list === l.style ? ' active' : ''}`}
          onClick={() => updateMapNode(node.id, listPatch(node, l.style))}
          aria-pressed={node.list === l.style}
          aria-label={l.label}
          title={l.label}
        >
          {l.icon}
        </button>
      ))}
    </>
  )
}
