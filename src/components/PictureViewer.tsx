import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useImageUrl } from '../store/images'

/** A picture as big as the window allows. Click anywhere or press Escape to close. */
export function PictureViewer({ imageId, onClose }: { imageId: string; onClose: () => void }) {
  const url = useImageUrl(imageId)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return createPortal(
    <div
      className="picture-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Picture"
      // Opened from inside other things (a map card): keep its clicks to itself.
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button className="icon-btn picture-viewer-close" onClick={onClose} aria-label="Close" autoFocus>
        <X size={20} />
      </button>
      {url ? <img src={url} alt="" /> : <p>{url === null ? 'This picture couldn’t be found.' : ''}</p>}
    </div>,
    document.body,
  )
}
