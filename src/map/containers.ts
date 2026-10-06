import type { ContainerLayout, MapNode, MapSize } from '../types'
import { parentOf, type MapDrop } from '../store/storyOps'
import type { StoryFlowNode } from './mapShared'

// Containers on the mind map: see-through areas that cards, and other
// containers, are put on. What's on a container says so with its
// `containerId`, and is saved at its place from the container's top-left
// corner (cards stacked on one are laid out instead). React Flow sees every
// card at its place on the map. Here: laying out what's on containers,
// sizing containers to fit, and working out where dropped cards end up.

type ContainerMapNode = Extract<MapNode, { kind: 'container' }>

/** The title bar along a container's top (ContainerNode draws it this tall); cards stack below it. */
export const TITLE_HEIGHT = 56
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

interface Laid {
  positions: { x: number; y: number }[]
  /** The room the cards take up, title bar included. */
  content: MapSize
  /** The smallest the container can be made (a grid can lose columns). */
  min: MapSize
}

/**
 * Where cards of these sizes go stacked on a container at `at` that's
 * `width` wide (which a grid fills), and the room they take up.
 */
export function stack(layout: Exclude<ContainerLayout, 'free'>, at: { x: number; y: number }, sizes: MapSize[], width: number): Laid {
  if (!sizes.length) return { positions: [], content: { width: 0, height: 0 }, min: { width: 0, height: 0 } }
  if (layout === 'grid') return grid(at, sizes, width)
  const down = layout === 'vertical'
  let along = down ? TITLE_HEIGHT : PAD
  let across = 0
  const positions = sizes.map((s) => {
    const p = down ? { x: at.x + PAD, y: at.y + along } : { x: at.x + along, y: at.y + TITLE_HEIGHT }
    along += (down ? s.height : s.width) + GAP
    across = Math.max(across, down ? s.width : s.height)
    return p
  })
  const length = along - GAP + PAD
  const content = down ? { width: across + 2 * PAD, height: length } : { width: length, height: across + TITLE_HEIGHT + PAD }
  return { positions, content, min: content }
}

/** Cards in rows of equal cells, as many to a row as fit across the container. */
function grid(at: { x: number; y: number }, sizes: MapSize[], width: number): Laid {
  const cell = Math.max(...sizes.map((s) => s.width))
  const columns = Math.max(1, Math.floor((width - 2 * PAD + GAP) / (cell + GAP)))
  const positions: { x: number; y: number }[] = []
  let top = TITLE_HEIGHT
  for (let first = 0; first < sizes.length; first += columns) {
    const row = sizes.slice(first, first + columns)
    row.forEach((_, i) => positions.push({ x: at.x + PAD + i * (cell + GAP), y: at.y + top }))
    top += Math.max(...row.map((s) => s.height)) + GAP
  }
  const used = Math.min(columns, sizes.length)
  const content = { width: 2 * PAD + used * cell + (used - 1) * GAP, height: top - GAP + PAD }
  return { positions, content, min: { width: cell + 2 * PAD, height: content.height } }
}

/** How many containers deep each card is (0: on the map itself). */
export function depths(nodes: StoryFlowNode[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const depth = new Map<string, number>()
  const of = (n: StoryFlowNode, seen = 0): number => {
    const known = depth.get(n.id)
    if (known !== undefined) return known
    const parent = byId.get(parentOf(n.data.node) ?? '')
    const d = parent && seen < nodes.length ? of(parent, seen + 1) + 1 : 0
    depth.set(n.id, d)
    return d
  }
  for (const n of nodes) of(n)
  return depth
}

/** These cards and everything on them, at any depth. */
export function withEverythingOn(nodes: StoryFlowNode[], ids: Iterable<string>): Set<string> {
  const all = new Set(ids)
  for (let grew = true; grew; ) {
    grew = false
    for (const n of nodes) {
      const parent = parentOf(n.data.node)
      if (parent && all.has(parent) && !all.has(n.id)) {
        all.add(n.id)
        grew = true
      }
    }
  }
  return all
}

/**
 * Lays out what's on containers and sizes each container to fit what's
 * stacked on it (never smaller than the size it was given). Sizes are worked
 * out from the innermost containers out; places from the outermost in, so
 * whatever is on a container goes where it goes. A card being dragged or
 * resized stays where it is. Returns `nodes` itself when nothing changed.
 */
export function arrange(nodes: StoryFlowNode[]): StoryFlowNode[] {
  if (!nodes.some(containerOf)) return nodes
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const on = new Map<string, StoryFlowNode[]>()
  for (const n of nodes) {
    const parent = parentOf(n.data.node)
    if (parent && byId.has(parent)) on.set(parent, [...(on.get(parent) ?? []), n])
  }
  const depth = depths(nodes)
  const boxes = nodes.filter(containerOf).sort((a, b) => depth.get(b.id)! - depth.get(a.id)!)

  // Sizes, innermost first: a container's size goes into the stack it's on.
  const shown = new Map<string, MapSize>()
  const laid = new Map<string, Laid>()
  const mins = new Map<string, MapSize>()
  const sizeHere = (n: StoryFlowNode) => shown.get(n.id) ?? sizeOf(n)
  for (const c of boxes) {
    const box = containerOf(c)!
    const cards = on.get(c.id) ?? []
    // While it's being resized, the size it's being given is the one on screen.
    const given = c.resizing ? { width: c.width ?? box.width, height: c.height ?? box.height } : box
    let content = { width: 0, height: 0 }
    let min = content
    if (box.layout !== 'free' && cards.length) {
      const l = stack(box.layout, { x: 0, y: 0 }, cards.map(sizeHere), given.width)
      laid.set(c.id, l)
      ;({ content, min } = l)
    }
    shown.set(c.id, { width: Math.max(given.width, content.width), height: Math.max(given.height, content.height) })
    mins.set(c.id, min)
  }

  // Places, outermost first: stacked cards in their slots, the rest where they are on their container.
  const place = new Map<string, { x: number; y: number }>()
  const home = new Map<string, { x: number; y: number }>()
  const at = (n: StoryFlowNode) => place.get(n.id) ?? n.position
  for (const c of [...boxes].reverse()) {
    const box = containerOf(c)!
    // Resized by hand, its corner moves; what's on it stays where it was until it's let go.
    const corner = c.resizing ? (home.get(c.id) ?? { x: box.x, y: box.y }) : at(c)
    const l = laid.get(c.id)
    ;(on.get(c.id) ?? []).forEach((card, i) => {
      const p = l
        ? { x: at(c).x + l.positions[i].x, y: at(c).y + l.positions[i].y }
        : { x: corner.x + card.data.node.x, y: corner.y + card.data.node.y }
      home.set(card.id, p)
      if (!card.dragging && !card.resizing) place.set(card.id, p)
    })
  }

  const updates = new Map<string, StoryFlowNode>()
  for (const n of nodes) {
    let next = n
    const p = place.get(n.id)
    if (p && (p.x !== n.position.x || p.y !== n.position.y)) next = { ...next, position: p }
    const size = shown.get(n.id)
    if (size) {
      const min = mins.get(n.id)!
      const count = on.get(n.id)?.length ?? 0
      const was = n.data.min
      if (n.width !== size.width || n.height !== size.height || was?.width !== min.width || was?.height !== min.height || n.data.count !== count) {
        next = { ...next, width: size.width, height: size.height, data: { ...n.data, min, count } }
      }
    }
    if (next !== n) updates.set(n.id, next)
  }
  return updates.size ? nodes.map((n) => updates.get(n.id) ?? n) : nodes
}

/** The innermost container under a point (the top one of those), leaving out some. */
export function containerAt(nodes: StoryFlowNode[], point: { x: number; y: number }, skip: Set<string>) {
  const depth = depths(nodes)
  let found: StoryFlowNode | undefined
  for (const n of nodes) {
    if (!containerOf(n) || skip.has(n.id)) continue
    const { width, height } = sizeOf(n)
    const inside = point.x >= n.position.x && point.x <= n.position.x + width && point.y >= n.position.y && point.y <= n.position.y + height
    if (inside && (!found || depth.get(n.id)! >= depth.get(found.id)!)) found = n
  }
  return found
}

/** Which card on a container's column, row or grid one dropped at `point` goes before (null: the end). */
export function stackBefore(nodes: StoryFlowNode[], container: StoryFlowNode, point: { x: number; y: number }, skip: Set<string>) {
  const layout = containerOf(container)?.layout
  for (const n of nodes) {
    if (parentOf(n.data.node) !== container.id || skip.has(n.id)) continue
    const { width, height } = sizeOf(n)
    const { x, y } = n.position
    const before =
      layout === 'grid'
        ? // In a grid: above its row, or in its row and left of its middle.
          point.y < y || (point.y < y + height && point.x < x + width / 2)
        : layout === 'horizontal'
          ? point.x < x + width / 2
          : point.y < y + height / 2
    if (before) return n.id
  }
  return null
}

/**
 * Where a card dropped with its top-left at `corner` and the pointer at
 * `point` goes: onto the container under the pointer (its place then saved
 * from that container's corner), or onto the map. `skip` are containers it
 * can't go on (itself, and what's on it).
 */
export function placeOnContainer(
  nodes: StoryFlowNode[],
  point: { x: number; y: number },
  corner: { x: number; y: number },
  skip = new Set<string>(),
): Omit<MapDrop, 'id'> {
  const target = containerAt(nodes, point, skip)
  if (!target) return { ...round(corner), containerId: null, before: undefined }
  const free = containerOf(target)?.layout === 'free'
  return {
    ...round({ x: corner.x - target.position.x, y: corner.y - target.position.y }),
    containerId: target.id,
    before: free ? undefined : stackBefore(nodes, target, point, skip),
  }
}

const round = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) })

/**
 * Where dragged cards end up: onto the container they're dropped on, or off
 * onto the map. What's on a dragged container stays on it. `nodes` are the
 * cards on screen and `dragged` the dragged ones where they were let go. The
 * card held goes where the pointer is (`held`); others go by their middles.
 */
export function planDrops(nodes: StoryFlowNode[], dragged: StoryFlowNode[], held?: { id: string; point: { x: number; y: number } }): MapDrop[] {
  const draggedIds = new Set(dragged.map((n) => n.id))
  const skip = withEverythingOn(nodes, draggedIds)
  const byId = new Map([...nodes, ...dragged].map((n) => [n.id, n]))
  // Top to bottom, so several cards dropped on one column keep their order.
  const order = [...dragged].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
  return order.map((n) => {
    const parent = byId.get(parentOf(n.data.node) ?? '')
    // On a container that moved too: it stays where it is on it.
    if (parent && skip.has(parent.id)) return { id: n.id, ...round({ x: n.position.x - parent.position.x, y: n.position.y - parent.position.y }) }
    const { width, height } = sizeOf(n)
    const point = held?.id === n.id ? held.point : { x: n.position.x + width / 2, y: n.position.y + height / 2 }
    return { id: n.id, ...placeOnContainer(nodes, point, n.position, skip) }
  })
}
