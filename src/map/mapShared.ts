import { createContext, useCallback, useContext } from 'react'
import { Position, useNodeId, useStore, useUpdateNodeInternals, type Node } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { useStory } from '../store/storyStore'
import type { MapNode, MapSize, NoteColor } from '../types'
import { CONTAINER_COLOR, NOTE_COLOR, type NewMapNode } from '../store/storyOps'
import { cleanColor, isPale, needsLightInk } from '../lib/colors'
import { TEXT_BOX_SIZE } from '../lib/textSize'

/** Data type for things dragged from the palette onto the canvas. */
export const DRAG_MIME = 'application/x-story-map-node'

export type PaletteItem =
  | { kind: 'arc' | 'chapter' | 'character' | 'element' | 'beat'; refId: string }
  | { kind: 'note' }
  | { kind: 'text' }
  | { kind: 'container' }

/** A palette item as a new card at a position (top-left corner). */
export function newNodeFor(item: PaletteItem, x: number, y: number): NewMapNode {
  if (item.kind === 'note') return { kind: 'note', x, y, width: 220, height: 160, text: '', color: NOTE_COLOR }
  if (item.kind === 'text') return { kind: 'text', x, y, width: 280, text: '', size: TEXT_BOX_SIZE }
  if (item.kind === 'container') return { kind: 'container', x, y, title: '', width: 360, height: 260, color: CONTAINER_COLOR, layout: 'vertical' }
  return { kind: item.kind, refId: item.refId, x, y }
}

/** Roughly where a new card's centre is, so drops land under the pointer. */
export const NEW_NODE_CENTER: Record<PaletteItem['kind'], { x: number; y: number }> = {
  note: { x: 110, y: 80 },
  text: { x: 140, y: 20 },
  container: { x: 180, y: 130 },
  arc: { x: 120, y: 40 },
  chapter: { x: 120, y: 50 },
  character: { x: 120, y: 40 },
  element: { x: 120, y: 40 },
  beat: { x: 120, y: 35 },
}

/** A note's, text box's or container's colour to paint, also for colours saved by name. */
export const paint = (color: NoteColor | undefined, fallback: string) => cleanColor(color) ?? fallback

/** Classes for writing on a colour: light ink on dark ones, an edge for pale ones. */
export const paperClasses = (hex: string) => `${needsLightInk(hex) ? ' dark-paper' : ''}${isPale(hex) ? ' pale' : ''}`

export type StoryFlowNode = Node<
  {
    node: MapNode
    /** On a container: the smallest it can be made around the cards stacked on it, and how many cards are on it. */
    min?: MapSize
    count?: number
  },
  MapNode['kind']
>

interface MapContextValue {
  /** The note or text box being typed in, if any. */
  editingId: string | null
  setEditingId: (id: string | null) => void
  /** Opens the story item behind a card (its page, the manuscript, the beat). */
  openItem: (node: MapNode) => void
  removeNode: (id: string) => void
  /** The container a dragged card would go onto if let go now. */
  dropTarget: string | null
}

export const MapContext = createContext<MapContextValue>({
  editingId: null,
  setEditingId: () => {},
  openItem: () => {},
  removeNode: () => {},
  dropTarget: null,
})

export const useMap = () => useContext(MapContext)

/**
 * Where a selected card's toolbar goes so it stays on screen: above the card
 * unless that's off the top of the map, and lined up with the card's left or
 * right edge when centring it would run off the side.
 */
export function useToolbarPlacement(id: string, selected: boolean): { position: Position; align: 'start' | 'center' | 'end' } {
  const key = useStore((s) => {
    const n = selected ? s.nodeLookup.get(id) : undefined
    if (!n) return 'top center'
    const [tx, ty, zoom] = s.transform
    const { x, y } = n.internals.positionAbsolute
    const side = y * zoom + ty < 56 ? 'bottom' : 'top'
    const center = (x + (n.measured.width ?? 0) / 2) * zoom + tx
    const half = Math.min(540, s.width - 24) / 2
    const align = center - half < 8 ? 'start' : center + half > s.width - 8 ? 'end' : 'center'
    return `${side} ${align}`
  })
  const [side, align] = key.split(' ') as ['top' | 'bottom', 'start' | 'center' | 'end']
  return { position: side === 'bottom' ? Position.Bottom : Position.Top, align }
}

/**
 * Focuses a field with the caret at the end, once it's on screen: a new card
 * stays hidden until React Flow has measured it, and hidden fields can't take
 * focus. Returns a function that stops trying.
 */
export function focusSoon(get: () => HTMLTextAreaElement | null): () => void {
  let frame = 0
  let tries = 0
  const run = () => {
    const el = get()
    if (!el) return
    el.focus({ preventScroll: true })
    if (document.activeElement === el) el.setSelectionRange(el.value.length, el.value.length)
    else if (tries++ < 20) frame = requestAnimationFrame(run)
  }
  run()
  return () => cancelAnimationFrame(frame)
}

// React Flow measures a card's connection points when the card changes size.
// Points inside a card also move when a list scrolls or a page turns, so those
// ask for a fresh measurement; requests are gathered into one per frame.
const waiting = new Set<string>()
let frame = 0

/** Asks React Flow to measure this card's connection points again. */
export function useRefreshHandles(): () => void {
  const nodeId = useNodeId()
  const update = useUpdateNodeInternals()
  return useCallback(() => {
    if (!nodeId) return
    waiting.add(nodeId)
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const ids = [...waiting]
      waiting.clear()
      update(ids)
    })
  }, [nodeId, update])
}

/** Anchors (starting with `prefix`) that saved lines use on this card. */
export function useSavedAnchors(prefix: string): string[] {
  const nodeId = useNodeId()
  return useStory(
    useShallow((s) =>
      s.mindMaps.flatMap((m) => m.edges).flatMap((e) =>
        [e.source === nodeId ? e.sourceAnchor : undefined, e.target === nodeId ? e.targetAnchor : undefined].filter(
          (a): a is string => !!a && a.startsWith(prefix),
        ),
      ),
    ),
  )
}
