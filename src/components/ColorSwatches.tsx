import { ARC_COLORS } from '../lib/colors'

interface Props {
  value: string
  onChange: (color: string) => void
}

export function ColorSwatches({ value, onChange }: Props) {
  const isCustom = !ARC_COLORS.some((c) => c.value.toLowerCase() === value.toLowerCase())
  return (
    <div className="swatches" role="radiogroup" aria-label="Arc color">
      {ARC_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={c.value.toLowerCase() === value.toLowerCase()}
          aria-label={c.name}
          title={c.name}
          className="swatch"
          style={{ background: c.value }}
          onClick={() => onChange(c.value)}
        />
      ))}
      <label className={`swatch custom${isCustom ? ' is-custom' : ''}`} title="Custom color" style={isCustom ? { background: value } : undefined}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Custom color" />
      </label>
    </div>
  )
}
