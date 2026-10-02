import { createContext, useCallback, useContext } from 'react'
import { Position, useNodeId, useStore, useUpdateNodeInternals, type Node } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { useStory } from '../store/storyStore'
import type { MapNode, NoteColor } from '../types'
import type { NewMapNode } from '../store/storyOps'
import { TEXT_BOX_SIZE } from '../lib/textSize'

/** Data type for things dragged from the palette onto the canvas. */
export const DRAG_MIME = 'application/x-story-map-node'

export type PaletteItem =
  | { kind: 'arc' | 'chapter' | 'character' | 'element' | 'beat'; refId: string }
  | { kind: 'note' }
  | { kind: 'text' }

/** A palette item as a new card at a position (top-left corner). */
export function newNodeFor(item: PaletteItem, x: number, y: number): NewMapNode {
  if (item.kind === 'note') return { kind: 'note', x, y, width: 220, height: 160, text: '', color: 'yellow' }
  if (item.kind === 'text') return { kind: 'text', x, y, width: 280, text: '', size: TEXT_BOX_SIZE }
  return { kind: item.kind, refId: item.refId, x, y }
}

/** Roughly where a new card's centre is, so drops land under the pointer. */
export const NEW_NODE_CENTER: Record<PaletteItem['kind'], { x: number; y: number }> = {
  note: { x: 110, y: 80 },
  text: { x: 140, y: 20 },
  arc: { x: 120, y: 40 },
  chapter: { x: 120, y: 50 },
  character: { x: 120, y: 40 },
  element: { x: 120, y: 40 },
  beat: { x: 120, y: 35 },
}

export const NOTE_COLOR_VALUES: Record<NoteColor, string> = {
  yellow: '#fbe7a1',
  pink: '#f9c9d9',
  blue: '#c7dcf7',
  green: '#cfe9c8',
  purple: '#dccff5',
  orange: '#fbd2ad',
  white: '#ffffff',
}

export type StoryFlowNode = Node<{ node: MapNode }, MapNode['kind']>

interface MapContextValue {
  /** The note or text box being typed in, if any. */
  editingId: string | null
  setEditingId: (id: string | null) => void
  /** Opens the story item behind a card (its page, the manuscript, the beat). */
  openItem: (node: MapNode) => void
  removeNode: (id: string) => void
}

export const MapContext = createContext<MapContextValue>({
  editingId: null,
  setEditingId: () => {},
  openItem: () => {},
  removeNode: () => {},
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
