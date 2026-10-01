import { blobToDataUrl, getImage } from '../store/images'
import type { ExportPicture, ExportPictures } from './manuscript'

/** An SVG (or anything Word can't take) drawn out as a PNG. */
async function asPng(blob: Blob, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the picture'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

const FORMATS: Record<string, ExportPicture['format']> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' }

/** The manuscript's pictures, read from the picture store, ready for the export formats. Missing ones are left out. */
export async function loadPictures(ids: string[]): Promise<ExportPictures> {
  const out: ExportPictures = new Map()
  for (const id of ids) {
    const image = await getImage(id)
    if (!image) continue
    let blob = image.blob
    let format = FORMATS[blob.type]
    if (!format) {
      try {
        blob = await asPng(blob, image.width, image.height)
        format = 'png'
      } catch {
        continue
      }
    }
    out.set(id, {
      format,
      bytes: new Uint8Array(await blob.arrayBuffer()),
      dataUrl: await blobToDataUrl(blob),
      width: image.width,
      height: image.height,
    })
  }
  return out
}
