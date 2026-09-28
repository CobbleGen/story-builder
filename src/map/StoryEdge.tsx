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
import { useStory } from '../store/storyStore'

export type StoryFlowEdge = Edge<{ edge: MapEdge }, 'story'>

/** Middle of a card's side, facing the other card. */
function anchor(node: InternalNode, toward: InternalNode): { x: number; y: number; position: Position } {
  const w = node.measured.width ?? 0
  const h = node.measured.height ?? 0
  const { x, y } = node.internals.positionAbsolute
  const cx = x + w / 2
  const cy = y + h / 2
  const tw = toward.measured.width ?? 0
  const th = toward.measured.height ?? 0
  const dx = toward.internals.positionAbsolute.x + tw / 2 - cx
  const dy = toward.internals.positionAbsolute.y + th / 2 - cy
  if (Math.abs(dx) * h > Math.abs(dy) * w) {
    return dx > 0 ? { x: x + w, y: cy, position: Position.Right } : { x, y: cy, position: Position.Left }
  }
  return dy > 0 ? { x: cx, y: y + h, position: Position.Bottom } : { x: cx, y, position: Position.Top }
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
  // Lines attach to whichever sides of the two cards face each other.
  const from = anchor(sourceNode, targetNode)
  const to = anchor(targetNode, sourceNode)
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
