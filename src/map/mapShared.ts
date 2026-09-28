import { createContext, useContext } from 'react'
import { Position, useStore, type Node } from '@xyflow/react'
import type { MapNode, NoteColor } from '../types'
import type { NewMapNode } from '../store/storyOps'

/** Data type for things dragged from the palette onto the canvas. */
export const DRAG_MIME = 'application/x-story-map-node'

export type PaletteItem =
  | { kind: 'arc' | 'chapter' | 'character' | 'beat'; refId: string }
  | { kind: 'note' }
  | { kind: 'text' }

/** A palette item as a new card at a position (top-left corner). */
export function newNodeFor(item: PaletteItem, x: number, y: number): NewMapNode {
  if (item.kind === 'note') return { kind: 'note', x, y, width: 220, height: 160, text: '', color: 'yellow' }
  if (item.kind === 'text') return { kind: 'text', x, y, width: 280, text: '', size: 'md' }
  return { kind: item.kind, refId: item.refId, x, y }
}

/** Roughly where a new card's centre is, so drops land under the pointer. */
export const NEW_NODE_CENTER: Record<PaletteItem['kind'], { x: number; y: number }> = {
  note: { x: 110, y: 80 },
  text: { x: 140, y: 20 },
  arc: { x: 120, y: 40 },
  chapter: { x: 120, y: 50 },
  character: { x: 120, y: 40 },
  beat: { x: 120, y: 35 },
}

export const NOTE_COLOR_VALUES: Record<NoteColor, string> = {
  yellow: '#fbe7a1',
  pink: '#f9c9d9',
  blue: '#c7dcf7',
  green: '#cfe9c8',
  purple: '#dccff5',
  orange: '#fbd2ad',
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
 * Which side of a selected card its toolbar goes on: above it, unless that
 * would put it off the top of the map.
 */
export function useToolbarSide(selected: boolean, y: number): Position {
  const nearTop = useStore((s) => selected && y * s.transform[2] + s.transform[1] < 56)
  return nearTop ? Position.Bottom : Position.Top
}
