import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useUi } from '../store/uiStore'
import { cleanColor, hexToHsv, hsvToHex } from '../lib/colors'
import { useRecentColors } from '../lib/useRecentColors'

// Picking a colour, anywhere one is picked: the colours used lately, and a
// colour wheel for any other.

interface Props {
  value: string | undefined
  onChange: (color: string) => void
  /** What the colour is for, for screen readers ("Arc colour"). */
  label: string
  /** How many recent colours show beside the wheel. */
  count?: number
  /** On a page, or in a card's floating toolbar on the map. */
  variant?: 'page' | 'toolbar'
}

/** The colours used lately, then a colour wheel button that opens the wheel for any colour. */
export function ColorPicker({ value, onChange, label, count = 10, variant = 'page' }: Props) {
  const recent = useRecentColors()
  const rememberColor = useUi((s) => s.rememberColor)
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  // The colour last chosen on the wheel, to remember when it closes.
  const chosen = useRef<string | null>(null)
  const current = cleanColor(value)

  const use = (color: string) => {
    onChange(color)
    rememberColor(color, recent)
  }
  const close = () => {
    setOpen(false)
    if (chosen.current) rememberColor(chosen.current, recent)
    chosen.current = null
  }

  return (
    <div className={`color-picker ${variant}`} role="group" aria-label={label}>
      {recent.slice(0, count).map((color) => (
        <button
          key={color}
          type="button"
          className={`color-swatch${color === current ? ' active' : ''}`}
          style={{ background: color }}
          onClick={() => use(color)}
          aria-label={`Recent colour ${color}`}
          aria-pressed={color === current}
          title={color}
        />
      ))}
      <button
        ref={button}
        type="button"
        className={`color-wheel-button${open ? ' open' : ''}`}
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Pick any colour"
        aria-expanded={open}
        title="Pick any colour"
      />
      {open && (
        <WheelPopover
          anchor={button}
          value={current ?? '#808080'}
          onChange={(color) => {
            chosen.current = color
            onChange(color)
          }}
          onClose={close}
        />
      )}
    </div>
  )
}

interface PopoverProps {
  anchor: RefObject<HTMLButtonElement | null>
  value: string
  onChange: (color: string) => void
  onClose: () => void
}

/** The wheel, floating by its button; a click elsewhere or Escape closes it. */
function WheelPopover({ anchor, value, onChange, onClose }: PopoverProps) {
  const pop = useRef<HTMLDivElement>(null)
  const latestClose = useRef(onClose)
  useEffect(() => {
    latestClose.current = onClose
  })

  // Keep it by its button, which may move (a toolbar following its card on the map).
  useLayoutEffect(() => {
    let frame = 0
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const el = pop.current
      if (a && el) {
        const { offsetWidth: w, offsetHeight: h } = el
        const left = Math.min(Math.max(8, a.left + a.width / 2 - w / 2), window.innerWidth - w - 8)
        const below = a.bottom + 8
        const top = below + h > window.innerHeight - 8 && a.top - h - 8 > 8 ? a.top - h - 8 : below
        el.style.left = `${Math.round(left)}px`
        el.style.top = `${Math.round(top)}px`
      }
      frame = requestAnimationFrame(place)
    }
    place()
    return () => cancelAnimationFrame(frame)
  }, [anchor])

  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const target = e.target as Node
      if (!pop.current?.contains(target) && !anchor.current?.contains(target)) latestClose.current()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      latestClose.current()
    }
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', escape, true)
    }
  }, [anchor])

  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return createPortal(
    <div
      ref={pop}
      className="color-popover"
      role="dialog"
      aria-label="Pick a colour"
      // Opened from inside other things (a card on the map): its clicks stay here.
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onDoubleClick={stop}
    >
      <ColorWheel value={value} onChange={onChange} />
    </div>,
    document.body,
  )
}

/** Hue around the wheel and saturation out from the middle, with brightness below and the hex code. */
function ColorWheel({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value))
  const [shown, setShown] = useState(value)
  const [draft, setDraft] = useState<string | null>(null)
  const ring = useRef<HTMLDivElement>(null)
  // Changed from elsewhere (undo, say): follow it, keeping the hue of greys.
  if (value !== shown) {
    setShown(value)
    if (hsvToHex(hsv.h, hsv.s, hsv.v) !== value) setHsv(hexToHsv(value))
  }
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v)

  const set = (next: { h: number; s: number; v: number }) => {
    setHsv(next)
    const color = hsvToHex(next.h, next.s, next.v)
    setShown(color)
    onChange(color)
  }
  const pickAt = (e: React.PointerEvent) => {
    const r = ring.current?.getBoundingClientRect()
    if (!r) return
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
    const s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2))
    // From black, picking on the wheel brings the colour back up to full brightness.
    set({ h, s, v: hsv.v < 0.05 ? 1 : hsv.v })
  }
  const typed = () => {
    const color = draft === null ? undefined : cleanColor(draft)
    if (color && color !== hex) set(hexToHsv(color))
    setDraft(null)
  }
  const angle = (hsv.h * Math.PI) / 180

  return (
    <div className="color-wheel-panel">
      <div
        ref={ring}
        className="color-wheel"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pickAt(e)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pickAt(e)
        }}
        aria-hidden
      >
        <span className="color-wheel-dark" style={{ opacity: 1 - hsv.v }} />
        <span
          className="color-wheel-knob"
          style={{
            left: `${50 + Math.cos(angle) * hsv.s * 50}%`,
            top: `${50 + Math.sin(angle) * hsv.s * 50}%`,
            background: hex,
          }}
        />
      </div>
      <input
        type="range"
        className="color-brightness"
        min={0}
        max={100}
        value={Math.round(hsv.v * 100)}
        onChange={(e) => set({ ...hsv, v: Number(e.target.value) / 100 })}
        style={{ '--full': hsvToHex(hsv.h, hsv.s, 1) } as React.CSSProperties}
        aria-label="Brightness"
      />
      <div className="color-hex-row">
        <span className="color-preview" style={{ background: hex }} />
        <input
          className="color-hex"
          value={draft ?? hex}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={typed}
          onKeyDown={(e) => {
            if (e.key === 'Enter') typed()
          }}
          spellCheck={false}
          aria-label="Colour code"
        />
      </div>
    </div>
  )
}
