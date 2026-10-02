import type { NodeChange } from '@xyflow/react'
import type { ContainerLayout, MapNode, MapSize } from '../types'
import { parentOf, type MapDrop } from '../store/storyOps'
import type { StoryFlowNode } from './mapShared'

// Containers on the mind map: see-through areas that cards are put on. The
// cards keep their own places on the map (they're not nested in React Flow);
// what's on a container is its `parentId`. Here: laying out the cards stacked
// on containers, carrying cards along when a container is dragged, and
// working out where dropped cards end up.

type ContainerMapNode = Extract<MapNode, { kind: 'container' }>

/** Room around and between cards stacked on a container. */
const PAD = 16
const GAP = 12

/**
 * A card's size on screen (a usual size until it's been measured). A
 * container's is the size it's given here, which it takes a moment to be measured at.
 */
export const sizeOf = (n: StoryFlowNode): MapSize =>
  n.type === 'container' && n.width && n.height
    ? { width: n.width, height: n.height }
    : { width: n.measured?.width ?? n.width ?? 240, height: n.measured?.height ?? n.height ?? 120 }

const containerOf = (n: StoryFlowNode) => (n.data.node.kind === 'container' ? (n.data.node as ContainerMapNode) : null)

/** Where cards of these sizes go stacked on a container at `at`, and the room they take up. */
export function stack(layout: Exclude<ContainerLayout, 'free'>, at: { x: number; y: number }, sizes: MapSize[]) {
  const down = layout === 'vertical'
  let along = PAD
  let across = 0
  const positions = sizes.map((s) => {
    const p = down ? { x: at.x + PAD, y: at.y + along } : { x: at.x + along, y: at.y + PAD }
    along += (down ? s.height : s.width) + GAP
    across = Math.max(across, down ? s.width : s.height)
    return p
  })
  const length = sizes.length ? along - GAP + PAD : 0
  const thickness = sizes.length ? across + 2 * PAD : 0
  return { positions, content: down ? { width: thickness, height: length } : { width: length, height: thickness } }
}

/**
 * Lays out the cards stacked on containers, and sizes each container to fit
 * them, never smaller than the size it was given. A card being dragged stays
 * where it is (keeping its place in the stack). Returns `nodes` itself when
 * nothing changed.
 */
export function arrange(nodes: StoryFlowNode[]): StoryFlowNode[] {
  if (!nodes.some(containerOf)) return nodes
  const on = new Map<string, StoryFlowNode[]>()
  for (const n of nodes) {
    const parent = parentOf(n.data.node)
    if (parent) on.set(parent, [...(on.get(parent) ?? []), n])
  }
  const updates = new Map<string, StoryFlowNode>()
  for (const c of nodes) {
    const box = containerOf(c)
    if (!box) continue
    const cards = on.get(c.id) ?? []
    // While it's being resized, the size it's being given is the one on screen.
    const given = c.resizing ? { width: c.width ?? box.width, height: c.height ?? box.height } : box
    let content = { width: 0, height: 0 }
    if (box.layout !== 'free' && cards.length) {
      const laid = stack(box.layout, c.position, cards.map(sizeOf))
      laid.positions.forEach((p, i) => {
        const card = cards[i]
        if (!card.dragging && (card.position.x !== p.x || card.position.y !== p.y)) updates.set(card.id, { ...card, position: p })
      })
      content = laid.content
    }
    const width = Math.max(given.width, content.width)
    const height = Math.max(given.height, content.height)
    const was = c.data.content
    if (c.width !== width || c.height !== height || was?.width !== content.width || was?.height !== content.height || c.data.count !== cards.length) {
      updates.set(c.id, { ...c, width, height, data: { ...c.data, content, count: cards.length } })
    }
  }
  return updates.size ? nodes.map((n) => updates.get(n.id) ?? n) : nodes
}

/** While a freeform container is dragged, the cards on it come along (stacked ones are laid out anyway). */
export function carryCards(changes: NodeChange<StoryFlowNode>[], before: StoryFlowNode[], after: StoryFlowNode[]): StoryFlowNode[] {
  const was = new Map(before.map((n) => [n.id, n]))
  const moving = new Set<string>()
  const shifts = new Map<string, { x: number; y: number }>()
  for (const change of changes) {
    if (change.type !== 'position' || !change.position) continue
    moving.add(change.id)
    const prev = was.get(change.id)
    // Only dragging: a container resized from its left or top edge leaves its cards be.
    if (!prev || !containerOf(prev) || change.dragging === undefined) continue
    const shift = { x: change.position.x - prev.position.x, y: change.position.y - prev.position.y }
    if (shift.x || shift.y) shifts.set(change.id, shift)
  }
  if (!shifts.size) return after
  return after.map((n) => {
    const parent = parentOf(n.data.node)
    const shift = parent ? shifts.get(parent) : undefined
    return shift && !moving.has(n.id) ? { ...n, position: { x: n.position.x + shift.x, y: n.position.y + shift.y } } : n
  })
}

/** The container under a point (the top one), leaving out some. */
export function containerAt(nodes: StoryFlowNode[], point: { x: number; y: number }, skip: Set<string>) {
  let found: StoryFlowNode | undefined
  for (const n of nodes) {
    if (!containerOf(n) || skip.has(n.id)) continue
    const { width, height } = sizeOf(n)
    if (point.x >= n.position.x && point.x <= n.position.x + width && point.y >= n.position.y && point.y <= n.position.y + height) found = n
  }
  return found
}

/** Which card on a container's column or row one centred at `point` goes before (null: the end). */
export function stackBefore(nodes: StoryFlowNode[], container: StoryFlowNode, point: { x: number; y: number }, skip: Set<string>) {
  const down = containerOf(container)?.layout !== 'horizontal'
  for (const n of nodes) {
    if (parentOf(n.data.node) !== container.id || skip.has(n.id)) continue
    const { width, height } = sizeOf(n)
    if (down ? point.y < n.position.y + height / 2 : point.x < n.position.x + width / 2) return n.id
  }
  return null
}

/** Where a card is to go on the map: onto the container under its middle, if there is one. */
export function placeOnContainer(nodes: StoryFlowNode[], centre: { x: number; y: number }, skip = new Set<string>()) {
  const target = containerAt(nodes, centre, skip)
  if (!target) return { parentId: null, before: undefined }
  const free = containerOf(target)?.layout === 'free'
  return { parentId: target.id, before: free ? undefined : stackBefore(nodes, target, centre, skip) }
}

const round = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) })

/**
 * Where dragged cards end up. A dragged container takes the cards on it
 * along; any other card goes onto the container it's dropped on, or off.
 * `nodes` are the cards on screen, `dragged` the dragged ones where they
 * were let go, and `saved` the map's cards as saved before the drag. The card
 * held goes where the pointer is (`held`); others go by their middles.
 */
export function planDrops(
  nodes: StoryFlowNode[],
  dragged: StoryFlowNode[],
  saved: MapNode[],
  held?: { id: string; point: { x: number; y: number } },
): MapDrop[] {
  const draggedIds = new Set(dragged.map((n) => n.id))
  const savedById = new Map(saved.map((n) => [n.id, n]))
  const drops: MapDrop[] = []
  for (const c of dragged) {
    const box = containerOf(c)
    if (!box) continue
    const at = round(c.position)
    drops.push({ id: c.id, ...at })
    const cards = nodes.filter((n) => parentOf(n.data.node) === c.id && !draggedIds.has(n.id))
    if (box.layout === 'free') {
      const was = savedById.get(c.id) ?? at
      for (const card of cards) {
        const s = savedById.get(card.id)
        if (s) drops.push({ id: card.id, x: s.x + at.x - was.x, y: s.y + at.y - was.y })
      }
    } else {
      stack(box.layout, at, cards.map(sizeOf)).positions.forEach((p, i) => drops.push({ id: cards[i].id, ...round(p) }))
    }
  }
  // Top to bottom, so several cards dropped on one column keep their order.
  const cards = dragged.filter((n) => !containerOf(n)).sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
  for (const n of cards) {
    const at = round(n.position)
    const parent = parentOf(n.data.node)
    if (parent && draggedIds.has(parent)) {
      drops.push({ id: n.id, ...at })
      continue
    }
    const { width, height } = sizeOf(n)
    const point = held?.id === n.id ? held.point : { x: n.position.x + width / 2, y: n.position.y + height / 2 }
    drops.push({ id: n.id, ...at, ...placeOnContainer(nodes, point, draggedIds) })
  }
  return drops
}
