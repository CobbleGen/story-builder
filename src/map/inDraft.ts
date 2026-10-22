import type { MindMap, StoryData } from '../types'
import { anchorItemId } from '../lib/anchors'

// The maps are every draft's, but a card for a chapter, arc or beat shows
// only in a draft it's in (with the lines to it); it stays on the map for
// the drafts it is in.

/** The map's cards (and lines) for chapters, arcs and beats not in the open draft. */
export function notInDraft(map: MindMap, data: Pick<StoryData, 'chapters' | 'arcs' | 'beats'>): { nodes: Set<string>; edges: Set<string> } {
  const here = (kind: string, id: string) =>
    kind === 'beat' ? !!data.beats[id] : kind === 'chapter' ? data.chapters.some((c) => c.id === id) : kind === 'arc' ? data.arcs.some((a) => a.id === id) : true
  const nodes = new Set(map.nodes.flatMap((n) => ('refId' in n && !here(n.kind, n.refId) ? [n.id] : [])))
  const anchorGone = (anchor?: string) => {
    if (!anchor) return false
    const kind = anchor.slice(0, anchor.indexOf(':'))
    const id = anchorItemId(anchor)
    return !!id && kind !== 'attr' && !here(kind, id)
  }
  const edges = new Set(
    map.edges.flatMap((e) => (nodes.has(e.source) || nodes.has(e.target) || anchorGone(e.sourceAnchor) || anchorGone(e.targetAnchor) ? [e.id] : [])),
  )
  return { nodes, edges }
}

/** The map as the open draft shows it (the same map when nothing's left out). */
export function mapInDraft(map: MindMap, hidden: { nodes: Set<string>; edges: Set<string> }): MindMap {
  if (!hidden.nodes.size && !hidden.edges.size) return map
  return { ...map, nodes: map.nodes.filter((n) => !hidden.nodes.has(n.id)), edges: map.edges.filter((e) => !hidden.edges.has(e.id)) }
}
