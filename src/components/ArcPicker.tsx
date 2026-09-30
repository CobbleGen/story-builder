import type { Arc } from '../types'
import { plainText } from '../lib/mentions'
import { useMentionLookup } from '../store/storyStore'
import { MentionText } from './MentionText'

interface Props {
  arcs: Arc[]
  value: string | null
  onChange: (arcId: string) => void
  /** Show only the dots, with the chosen arc's name beside them. */
  compact?: boolean
}

export function ArcPicker({ arcs, value, onChange, compact }: Props) {
  const selected = arcs.find((a) => a.id === value)
  const lookup = useMentionLookup()
  return (
    <div className={`arc-picker${compact ? ' compact' : ''}`} role="radiogroup" aria-label="Arc">
      {arcs.map((arc) => (
        <button
          key={arc.id}
          type="button"
          role="radio"
          aria-checked={arc.id === value}
          className={`arc-option${arc.id === value ? ' selected' : ''}`}
          style={{ '--arc': arc.color } as React.CSSProperties}
          title={plainText(arc.name, lookup)}
          onClick={() => onChange(arc.id)}
        >
          <span className="arc-dot" />
          {!compact && (
            <span className="arc-option-name">
              <MentionText text={arc.name} fallback="Untitled arc" />
            </span>
          )}
        </button>
      ))}
      {compact && selected && (
        <span className="arc-picker-label">
          <MentionText text={selected.name} fallback="Untitled arc" />
        </span>
      )}
    </div>
  )
}
