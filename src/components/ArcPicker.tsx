import type { Arc } from '../types'

interface Props {
  arcs: Arc[]
  value: string | null
  onChange: (arcId: string) => void
  /** Show only the dots, with the chosen arc's name beside them. */
  compact?: boolean
}

export function ArcPicker({ arcs, value, onChange, compact }: Props) {
  const selected = arcs.find((a) => a.id === value)
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
          title={arc.name}
          onClick={() => onChange(arc.id)}
        >
          <span className="arc-dot" />
          {!compact && <span className="arc-option-name">{arc.name || 'Untitled arc'}</span>}
        </button>
      ))}
      {compact && selected && <span className="arc-picker-label">{selected.name}</span>}
    </div>
  )
}
