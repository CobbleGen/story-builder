import { makeId } from './id'
import { putImage } from '../store/images'

// Adding a picture from a file (picked, dropped or pasted). Big photos are
// scaled down so the browser's storage doesn't fill up: the longest side is
// at most MAX_SIDE, saved as JPEG, or PNG when it has see-through parts. Small
// JPEGs and PNGs are kept as they are, and so are GIFs (which may move) and
// SVGs (which scale anyway).

export const MAX_SIDE = 2000
const KEEP_BYTES = 1.5 * 1024 * 1024
const MAX_BYTES = 25 * 1024 * 1024

export interface AddedPicture {
  id: string
  width: number
  height: number
}

export class PictureError extends Error {}

/** Whether something dropped or pasted is a picture this can take. */
export const isPicture = (file: File | Blob) => file.type.startsWith('image/')

/** The picture files among a drop or a paste. */
export function picturesIn(data: DataTransfer | null): File[] {
  return data ? [...data.files].filter(isPicture) : []
}

function decodeWithImg(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new PictureError('That picture couldn’t be opened.'))
    }
    img.src = url
  })
}

/** Whether any pixel is see-through, judged on a small copy. */
function hasTransparency(source: CanvasImageSource, width: number, height: number): boolean {
  const scale = Math.min(1, 128 / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true
  return false
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new PictureError('That picture couldn’t be saved.'))), type, quality),
  )

/** Stores a picture file; returns its id and size in pixels. */
export async function addPicture(file: File | Blob, name = file instanceof File ? file.name : ''): Promise<AddedPicture> {
  if (!isPicture(file)) throw new PictureError('That isn’t a picture.')
  if (file.size > MAX_BYTES) throw new PictureError('That picture is too big (over 25 MB).')
  let blob: Blob = file
  let width: number
  let height: number

  if (file.type === 'image/svg+xml') {
    const img = await decodeWithImg(file)
    width = img.naturalWidth || 800
    height = img.naturalHeight || 600
  } else {
    let source: ImageBitmap | HTMLImageElement
    try {
      source = await createImageBitmap(file)
    } catch {
      source = await decodeWithImg(file)
    }
    width = 'naturalWidth' in source ? source.naturalWidth : source.width
    height = 'naturalHeight' in source ? source.naturalHeight : source.height
    if (!width || !height) throw new PictureError('That picture couldn’t be opened.')
    const keep =
      file.type === 'image/gif' ||
      ((file.type === 'image/jpeg' || file.type === 'image/png') && file.size <= KEEP_BYTES && Math.max(width, height) <= MAX_SIDE)
    if (!keep) {
      const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new PictureError('That picture couldn’t be opened.')
      const clear = hasTransparency(source, width, height)
      if (!clear) {
        // JPEG has no see-through parts; paint a white page under it.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
      blob = clear ? await toBlob(canvas, 'image/png') : await toBlob(canvas, 'image/jpeg', 0.86)
      width = canvas.width
      height = canvas.height
    }
    if ('close' in source) source.close()
  }

  const id = makeId('img')
  await putImage({ id, blob, type: blob.type, width, height, name, addedAt: Date.now() })
  return { id, width, height }
}
