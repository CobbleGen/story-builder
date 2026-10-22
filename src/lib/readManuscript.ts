import { generateJSON } from '@tiptap/core'
import type { RichNode } from '../types'
import { manuscriptExtensions } from '../editor/extensions'
import { textToHtml } from './manuscriptImport'
import { addPicture } from './pictures'

// Reading a manuscript file (Word, Markdown or plain text) into the editor's
// form, in one piece, ready to split into chapters. Loaded only when a file
// is being brought in: the Word and Markdown readers are large.

export type ManuscriptFormat = 'docx' | 'md' | 'txt'

/** The files it takes, for a file picker. */
export const MANUSCRIPT_FILES = '.docx,.md,.markdown,.txt,.text'

export function formatOf(name: string): ManuscriptFormat | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'docx') return 'docx'
  if (ext === 'md' || ext === 'markdown') return 'md'
  if (ext === 'txt' || ext === 'text') return 'txt'
  return null
}

export class ManuscriptError extends Error {}

export interface ReadManuscript {
  doc: RichNode
  /** Pictures brought in with it (Word files only). */
  pictures: number
  /** The book's title, set apart in the file (Word's Title style). */
  title?: string
}

/** Pictures found while reading a Word file, kept in the picture store; their place marked in the text for now. */
const PICTURE_SRC = /^story-picture:([\w-]+):(\d+):(\d+)$/

async function docxToHtml(file: File): Promise<{ html: string; pictures: number; title?: string }> {
  const { default: mammoth } = await import('mammoth')
  let pictures = 0
  let result: { value: string }
  try {
    result = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      {
        styleMap: ["p[style-name='Title'] => p.book-title:fresh", "p[style-name='Subtitle'] => p:fresh"],
        convertImage: mammoth.images.imgElement(async (image) => {
          try {
            const picture = await addPicture(new Blob([await image.readAsArrayBuffer()], { type: image.contentType }))
            pictures++
            return { src: `story-picture:${picture.id}:${picture.width}:${picture.height}` }
          } catch {
            return { src: '' }
          }
        }),
      },
    )
  } catch {
    throw new ManuscriptError('That Word file couldn’t be read. Is it a .docx (not an older .doc)?')
  }
  const page = new DOMParser().parseFromString(result.value, 'text/html')
  // The book's title is the story's, not a chapter's.
  const titles = [...page.querySelectorAll('p.book-title')]
  const title = titles.map((t) => t.textContent?.trim()).find(Boolean)
  for (const t of titles) t.remove()
  // A picture is a block of its own in the manuscript: out of its paragraph.
  for (const img of [...page.querySelectorAll('img')]) {
    const found = PICTURE_SRC.exec(img.getAttribute('src') ?? '')
    const holder = img.closest('p, h1, h2, h3, h4, h5, h6, li')
    if (found) {
      const figure = page.createElement('figure')
      figure.setAttribute('data-picture', '')
      figure.setAttribute('data-image-id', found[1])
      figure.setAttribute('data-width', found[2])
      figure.setAttribute('data-height', found[3])
      figure.setAttribute('data-size', 'medium')
      figure.setAttribute('data-alt', img.getAttribute('alt') ?? '')
      if (holder) holder.before(figure)
      else img.before(figure)
    }
    img.remove()
    if (holder && !holder.textContent?.trim() && !holder.querySelector('img')) holder.remove()
  }
  // Footnotes and endnotes (listed at the end, marked in the text): left out.
  for (const note of page.querySelectorAll('li[id^="footnote-"], li[id^="endnote-"]')) note.closest('ol')?.remove()
  for (const mark of page.querySelectorAll('a[href^="#footnote-"], a[href^="#endnote-"]')) (mark.closest('sup') ?? mark).remove()
  return { html: page.body.innerHTML, pictures, title }
}

/** A manuscript file read into the editor's form. */
export async function readManuscript(file: File): Promise<ReadManuscript> {
  const format = formatOf(file.name)
  if (!format) throw new ManuscriptError('Choose a Word (.docx), Markdown (.md) or plain text (.txt) file.')
  let html: string
  let pictures = 0
  let title: string | undefined
  if (format === 'docx') {
    ;({ html, pictures, title } = await docxToHtml(file))
  } else if (format === 'md') {
    const { marked } = await import('marked')
    // Pictures elsewhere on the web aren't brought in.
    html = (await marked.parse(await file.text(), { gfm: true })).replace(/<img\b[^>]*>/gi, '')
  } else {
    html = textToHtml(await file.text())
  }
  const doc = generateJSON(html, manuscriptExtensions('')) as RichNode
  if (!doc.content?.some((n) => n.content?.length || n.type === 'picture')) throw new ManuscriptError('There’s no text in that file.')
  return { doc, pictures, title }
}
