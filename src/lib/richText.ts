import type { RichNode } from '../types'

// Helpers over a chapter's saved text (TipTap/ProseMirror JSON), for changes
// made outside the editor: deleting beats, characters or elements.

/** Mark that links a stretch of text to a beat (attrs: beatId). */
export const BEAT_MARK = 'beatLink'
/** Inline node for a mention of a character or element (attrs: id, label). */
export const MENTION_NODE = 'mention'
/** Block node for a picture (attrs: imageId, size, width, height, alt). */
export const PICTURE_NODE = 'picture'

/** How wide a picture is in the text: a third, two thirds, or the whole width. */
export type PictureSize = 'small' | 'medium' | 'full'
export const PICTURE_SIZES: PictureSize[] = ['small', 'medium', 'full']
/** The share of the text's width each size takes. */
export const PICTURE_WIDTH: Record<PictureSize, number> = { small: 0.35, medium: 0.65, full: 1 }

export const pictureSizeOf = (value: unknown): PictureSize =>
  PICTURE_SIZES.includes(value as PictureSize) ? (value as PictureSize) : 'medium'

type Mark = NonNullable<RichNode['marks']>[number]

const sameMarks = (a: Mark[] | undefined, b: Mark[] | undefined) =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? [])

/** Joins neighbouring text nodes that carry the same marks. */
function mergeText(nodes: RichNode[]): RichNode[] {
  const out: RichNode[] = []
  for (const node of nodes) {
    const prev = out[out.length - 1]
    if (prev && prev.type === 'text' && node.type === 'text' && sameMarks(prev.marks, node.marks)) {
      out[out.length - 1] = { ...prev, text: (prev.text ?? '') + (node.text ?? '') }
    } else {
      out.push(node)
    }
  }
  return out
}

/**
 * Rebuilds the tree, letting `visit` replace each node (after its children
 * are done). Unchanged subtrees keep their identity, so callers can tell
 * whether anything changed.
 */
function transform(node: RichNode, visit: (node: RichNode) => RichNode): RichNode {
  let next = node
  if (node.content) {
    let changed = false
    const children = node.content.map((child) => {
      const mapped = transform(child, visit)
      if (mapped !== child) changed = true
      return mapped
    })
    if (changed) next = { ...node, content: mergeText(children) }
  }
  return visit(next)
}

/** Removes the highlights linking text to any of these beats. */
export function stripBeatLinks(doc: RichNode, beatIds: Set<string>): RichNode {
  return transform(doc, (node) => {
    if (!node.marks?.some((m) => m.type === BEAT_MARK && beatIds.has(String(m.attrs?.beatId)))) return node
    const marks = node.marks.filter((m) => !(m.type === BEAT_MARK && beatIds.has(String(m.attrs?.beatId))))
    const { marks: _, ...rest } = node
    return marks.length ? { ...rest, marks } : rest
  })
}

/** Turns mentions of a character or element into plain text with its name. */
export function unlinkMentions(doc: RichNode, id: string, name: string): RichNode {
  return transform(doc, (node) =>
    node.type === MENTION_NODE && node.attrs?.id === id
      ? { type: 'text', text: name, ...(node.marks ? { marks: node.marks } : {}) }
      : node,
  )
}

export function countMentions(node: RichNode, id: string): number {
  let n = node.type === MENTION_NODE && node.attrs?.id === id ? 1 : 0
  for (const child of node.content ?? []) n += countMentions(child, id)
  return n
}

export function isDoc(value: unknown): value is RichNode {
  return typeof value === 'object' && value !== null && (value as RichNode).type === 'doc'
}
