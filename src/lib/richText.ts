import type { RichNode } from '../types'

// Helpers over a chapter's saved text (TipTap/ProseMirror JSON), for changes
// made outside the editor: deleting beats or characters.

/** Mark that links a stretch of text to a beat (attrs: beatId). */
export const BEAT_MARK = 'beatLink'
/** Inline node for a character mention (attrs: id, label). */
export const MENTION_NODE = 'mention'

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

/** Turns mentions of a character into plain text with their name. */
export function unlinkMentions(doc: RichNode, characterId: string, name: string): RichNode {
  return transform(doc, (node) =>
    node.type === MENTION_NODE && node.attrs?.id === characterId
      ? { type: 'text', text: name, ...(node.marks ? { marks: node.marks } : {}) }
      : node,
  )
}

export function countMentions(node: RichNode, characterId: string): number {
  let n = node.type === MENTION_NODE && node.attrs?.id === characterId ? 1 : 0
  for (const child of node.content ?? []) n += countMentions(child, characterId)
  return n
}

export function isDoc(value: unknown): value is RichNode {
  return typeof value === 'object' && value !== null && (value as RichNode).type === 'doc'
}
