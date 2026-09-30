import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, MoreHorizontal } from 'lucide-react'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  /** Shows a tick: the current choice among several. */
  checked?: boolean
  /** A thin line above this item, starting a new group. */
  separated?: boolean
}

interface Props {
  items: MenuItem[]
  label: string
  align?: 'left' | 'right'
  trigger?: ReactNode
}

export function Menu({ items, label, align = 'right', trigger }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="menu" ref={ref}>
      <button
        className="icon-btn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {trigger ?? <MoreHorizontal size={18} />}
      </button>
      {open && (
        <div className={`menu-list menu-${align}`} role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              className={`menu-item${item.danger ? ' danger' : ''}${item.separated ? ' separated' : ''}`}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.icon}
              {item.label}
              {item.checked && <Check size={15} className="menu-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
