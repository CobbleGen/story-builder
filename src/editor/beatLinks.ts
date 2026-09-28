import { Mark, mergeAttributes, type Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { BEAT_MARK } from '../lib/richText'

/**
 * Links a stretch of text to a beat. Several beats can cover the same text,
 * and typing at the edge doesn't extend the link.
 */
export const BeatLink = Mark.create({
  name: BEAT_MARK,
  inclusive: false,
  excludes: '',
  addAttributes() {
    return {
      beatId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-beat'),
        renderHTML: (attrs) => (attrs.beatId ? { 'data-beat': attrs.beatId } : {}),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-beat]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'beat-link' }, HTMLAttributes), 0]
  },
})

/** Links the selected text to a beat. Returns false when nothing is selected. */
export function linkSelection(editor: Editor, beatId: string): boolean {
  const { from, to, empty } = editor.state.selection
  if (empty) return false
  const mark = editor.schema.marks[BEAT_MARK].create({ beatId })
  editor.view.dispatch(editor.state.tr.addMark(from, to, mark))
  return true
}

/** Removes every link to a beat from the text. */
export function unlinkBeat(editor: Editor, beatId: string): void {
  const mark = editor.schema.marks[BEAT_MARK].create({ beatId })
  const tr = editor.state.tr.removeMark(0, editor.state.doc.content.size, mark)
  if (tr.docChanged) editor.view.dispatch(tr)
}

/** Beat id -> the first stretch of text linked to it. */
export function linkedRanges(doc: PmNode): Map<string, { from: number; to: number }> {
  const ranges = new Map<string, { from: number; to: number }>()
  doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const mark of node.marks) {
      if (mark.type.name !== BEAT_MARK) continue
      const id = String(mark.attrs.beatId)
      const range = ranges.get(id)
      if (!range) ranges.set(id, { from: pos, to: pos + node.nodeSize })
      else if (range.to === pos) range.to = pos + node.nodeSize
    }
  })
  return ranges
}

/**
 * Where a beat linked at `from` belongs in the chapter's beat order: after
 * the last beat linked earlier in the text, else before the first one linked
 * later, else at the end.
 */
export function chapterIndexFor(beatIds: string[], ranges: Map<string, { from: number }>, from: number): number {
  let lastBefore = -1
  let firstAfter = -1
  beatIds.forEach((id, i) => {
    const range = ranges.get(id)
    if (!range) return
    if (range.from < from) lastBefore = i
    else if (firstAfter === -1) firstAfter = i
  })
  if (lastBefore !== -1) return lastBefore + 1
  if (firstAfter !== -1) return firstAfter
  return beatIds.length
}
