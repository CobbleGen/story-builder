import { useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
  useInternalNode,
  useStoreApi,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react'
import { ArrowRight, Tag, Trash2 } from 'lucide-react'
import type { MapEdge } from '../types'
import { anchorHandle } from '../lib/anchors'
import { useStory } from '../store/storyStore'

export type StoryFlowEdge = Edge<{ edge: MapEdge }, 'story'>

type End = { x: number; y: number; position: Position }
type Point = { x: number; y: number }

const centre = (node: InternalNode): Point => ({
  x: node.internals.positionAbsolute.x + (node.measured.width ?? 0) / 2,
  y: node.internals.positionAbsolute.y + (node.measured.height ?? 0) / 2,
})

/** Middle of a card's side, facing a point. */
function cardEnd(node: InternalNode, toward: Point): End {
  const w = node.measured.width ?? 0
  const h = node.measured.height ?? 0
  const { x, y } = node.internals.positionAbsolute
  const cx = x + w / 2
  const cy = y + h / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  if (Math.abs(dx) * h > Math.abs(dy) * w) {
    return dx > 0 ? { x: x + w, y: cy, position: Position.Right } : { x, y: cy, position: Position.Left }
  }
  return dy > 0 ? { x: cx, y: y + h, position: Position.Bottom } : { x: cx, y, position: Position.Top }
}

/**
 * The side of an anchored row (a beat, an attribute, a paragraph) facing the
 * other end, or null while the row isn't on show (card closed, scrolled away,
 * on another page), when the line attaches to the card instead.
 */
function rowEnd(node: InternalNode, anchor: string | undefined, toward: Point, loop: boolean): End | null {
  if (!anchor) return null
  const handles = node.internals.handleBounds?.source ?? []
  const left = handles.find((h) => h.id === anchorHandle(anchor, 'l'))
  const right = handles.find((h) => h.id === anchorHandle(anchor, 'r'))
  if (!left || !right) return null
  const { x, y } = node.internals.positionAbsolute
  const lx = x + left.x + left.width / 2
  const rx = x + right.x + right.width / 2
  const ry = y + left.y + left.height / 2
  // Two rows of the same card join with a loop out of the right-hand side.
  return !loop && toward.x < (lx + rx) / 2
    ? { x: lx, y: ry, position: Position.Left }
    : { x: rx, y: ry, position: Position.Right }
}

/** A curved line with an optional label; when selected it offers label, arrow and delete. */
export function StoryEdge({ id, source, target, data, selected, markerEnd }: EdgeProps<StoryFlowEdge>) {
  const updateMapEdge = useStory((s) => s.updateMapEdge)
  const removeMapEdges = useStory((s) => s.removeMapEdges)
  const [editing, setEditing] = useState(false)
  const store = useStoreApi()
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const edge = data?.edge
  if (!edge || !sourceNode || !targetNode) return null
  // Lines attach to the rows they were drawn from, else to whichever sides
  // of the two cards face each other.
  const loop = source === target
  const fromRow = rowEnd(sourceNode, edge.sourceAnchor, centre(targetNode), loop)
  const toRow = rowEnd(targetNode, edge.targetAnchor, fromRow ?? centre(sourceNode), loop)
  const from = fromRow ?? cardEnd(sourceNode, toRow ?? centre(targetNode))
  const to = toRow ?? cardEnd(targetNode, from)
  const [path, labelX, labelY] = getBezierPath({
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: from.position,
    targetX: to.x,
    targetY: to.y,
    targetPosition: to.position,
  })

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={`map-edge${selected ? ' selected' : ''}`} interactionWidth={18} />
      <EdgeLabelRenderer>
        <div
          className={`map-edge-label-wrap nodrag nopan${selected ? ' selected' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {editing ? (
            <input
              autoFocus
              className="map-edge-input"
              defaultValue={edge.label}
              placeholder="Label"
              aria-label="Line label"
              onBlur={(e) => {
                updateMapEdge(id, { label: e.target.value.trim() })
                setEditing(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
          ) : (
            edge.label && (
              <button
                className={`map-edge-label${selected ? ' selected' : ''}`}
                onClick={() => store.getState().addSelectedEdges([id])}
                onDoubleClick={() => setEditing(true)}
              >
                {edge.label}
              </button>
            )
          )}
          {selected && !editing && (
            <div className="map-edge-tools">
              <button className="map-tool" onClick={() => setEditing(true)}>
                <Tag size={13} /> {edge.label ? 'Rename' : 'Label'}
              </button>
              <button
                className={`map-tool${edge.arrow ? ' active' : ''}`}
                onClick={() => updateMapEdge(id, { arrow: !edge.arrow })}
                title="Show an arrow at the end"
              >
                <ArrowRight size={13} /> Arrow
              </button>
              <button className="map-tool" onClick={() => removeMapEdges([id])} aria-label="Delete line">
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
