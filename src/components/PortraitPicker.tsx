import { useEffect, useRef, useState } from 'react'
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react'
import { useImageUrl } from '../store/images'
import { addPicture, picturesIn } from '../lib/pictures'
import { askConfirm } from '../lib/confirm'
import { PictureViewer } from './PictureViewer'

interface Props {
  imageId: string | undefined
  onChange: (imageId: string | null) => void
  /** Tall for a character's portrait, wide for a place's or thing's picture. */
  shape: 'tall' | 'wide'
  /** What it's called here: "portrait" or "picture". */
  noun: string
}

/**
 * A character's portrait, or a place's picture, on their page. Click to pick
 * a file; a picture can also be dropped on it, or pasted anywhere on the page
 * (except while typing). Clicking a picture shows it full size.
 */
export function PortraitPicker({ imageId, onChange, shape, noun }: Props) {
  const url = useImageUrl(imageId)
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState(false)

  const take = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setBusy(true)
    try {
      onChange((await addPicture(file)).id)
    } catch (error) {
      await askConfirm({
        title: 'That picture couldn’t be added',
        message: error instanceof Error ? error.message : undefined,
        notice: true,
      })
    } finally {
      setBusy(false)
    }
  }
  const latestTake = useRef(take)
  useEffect(() => {
    latestTake.current = take
  })

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as Element | null
      if (target?.closest?.('input, textarea, [contenteditable="true"]')) return
      const files = picturesIn(e.clipboardData)
      if (!files.length) return
      e.preventDefault()
      void latestTake.current(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const pick = () => input.current?.click()
  // Still loading (undefined): an empty frame, so the page doesn't jump.
  const shown = imageId && url !== null
  return (
    <div
      className={`portrait portrait-${shape}${shown ? ' has-picture' : ''}${over ? ' drop-over' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const files = picturesIn(e.dataTransfer)
        if (!files.length) return
        e.preventDefault()
        void take(files)
      }}
    >
      {shown ? (
        <>
          <button className="portrait-view" onClick={() => setViewing(true)} aria-label={`See the ${noun} full size`}>
            {url && <img src={url} alt="" draggable={false} />}
          </button>
          <div className="portrait-tools">
            <button className="portrait-tool" onClick={pick} disabled={busy} title={`Change ${noun}`} aria-label={`Change ${noun}`}>
              <RefreshCw size={13} />
            </button>
            <button className="portrait-tool" onClick={() => onChange(null)} title={`Remove ${noun}`} aria-label={`Remove ${noun}`}>
              <Trash2 size={13} />
            </button>
          </div>
        </>
      ) : (
        <button className="portrait-add" onClick={pick} disabled={busy} title="Pick a picture, or drop or paste one here">
          <ImagePlus size={20} />
          <span>{busy ? 'Adding…' : `Add ${noun}`}</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          void take(files)
        }}
      />
      {viewing && imageId && <PictureViewer imageId={imageId} onClose={() => setViewing(false)} />}
    </div>
  )
}
