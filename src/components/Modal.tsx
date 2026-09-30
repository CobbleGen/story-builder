import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  accent?: string
  variant?: 'confirm' | 'wide'
}

// Open modals, oldest first; Escape only closes the topmost one.
const stack: object[] = []

export function Modal({ title, onClose, children, footer, accent, variant }: Props) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const me = {}
    stack.push(me)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(me), 1)
    }
  }, [])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal${variant ? ` ${variant}` : ''}`}
        role={variant === 'confirm' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-label={title}
        style={accent ? ({ '--arc': accent } as React.CSSProperties) : undefined}
      >
        {variant !== 'confirm' && (
          <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
