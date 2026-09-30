import { useRef, type KeyboardEvent } from 'react'
import type { ElementKind } from '../types'
import { ELEMENT_KINDS } from '../store/storyOps'
import { ELEMENT_KIND_NAMES } from '../lib/elements'
import { KindIcon } from './ElementIcon'

/** Place, object, group or other, as a row of choices (arrow keys move between them). */
export function KindPicker({ value, onChange }: { value: ElementKind; onChange: (kind: ElementKind) => void }) {
  const group = useRef<HTMLDivElement>(null)
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const i = (ELEMENT_KINDS.indexOf(value) + step + ELEMENT_KINDS.length) % ELEMENT_KINDS.length
    onChange(ELEMENT_KINDS[i])
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i]?.focus()
  }
  return (
    <div ref={group} className="kind-picker" role="radiogroup" aria-label="What it is" onKeyDown={onKeyDown}>
      {ELEMENT_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          role="radio"
          aria-checked={value === kind}
          tabIndex={value === kind ? 0 : -1}
          className={`kind-option${value === kind ? ' active' : ''}`}
          onClick={() => onChange(kind)}
        >
          <KindIcon kind={kind} size={13} />
          {ELEMENT_KIND_NAMES[kind].one}
        </button>
      ))}
    </div>
  )
}
