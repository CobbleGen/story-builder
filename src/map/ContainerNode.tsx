import { useEffect, useRef } from 'react'
import { NodeResizer, NodeToolbar, useReactFlow, type NodeProps } from '@xyflow/react'
import { Columns3, LayoutGrid, PenLine, Rows3, Shapes, Trash2, type LucideIcon } from 'lucide-react'
import type { ContainerLayout, MapNode } from '../types'
import { useStory } from '../store/storyStore'
import { CONTAINER_COLOR, parentOf } from '../store/storyOps'
import { ColorPicker } from '../components/ColorPicker'
import { MentionText } from '../components/MentionText'
import { MentionTextarea } from '../components/MentionTextarea'
import { Handles } from './EntityNodes'
import { TITLE_HEIGHT } from './containers'
import { focusSoon, paint, useMap, useToolbarPlacement, type StoryFlowNode } from './mapShared'

type ContainerMapNode = Extract<MapNode, { kind: 'container' }>

const LAYOUTS: { layout: ContainerLayout; label: string; icon: LucideIcon }[] = [
  { layout: 'vertical', label: 'Stack cards downwards', icon: Rows3 },
  { layout: 'horizontal', label: 'Stack cards side by side', icon: Columns3 },
  { layout: 'grid', label: 'Cards in a grid, as many across as fit', icon: LayoutGrid },
  { layout: 'free', label: 'Place cards freely', icon: Shapes },
]

const MIN = { width: 120, height: TITLE_HEIGHT + 40 }

/**
 * A see-through area on the map to put cards on, with a title along its top.
 * Cards dropped on it stack down it, across it or in a grid, or stay where
 * they're put (freeform); they move with it. Deleting it leaves its cards on
 * the map. Double-click the title to write it.
 */
export function ContainerNode({ id, data, selected }: NodeProps<StoryFlowNode>) {
  const node = data.node as ContainerMapNode
  const updateMapNode = useStory((s) => s.updateMapNode)
  const setContainerLayout = useStory((s) => s.setContainerLayout)
  const { removeNode, dropTarget, editingId, setEditingId } = useMap()
  const { getNodes } = useReactFlow<StoryFlowNode>()
  const toolbar = useToolbarPlacement(id, selected)
  const editing = editingId === id
  const input = useRef<HTMLTextAreaElement>(null)
  const resizedFrom = useRef<{ width: number; height: number } | null>(null)
  const min = data.min
  const color = paint(node.color, CONTAINER_COLOR)

  useEffect(() => (editing ? focusSoon(() => input.current) : undefined), [editing])

  const setLayout = (layout: ContainerLayout) => {
    if (layout === node.layout) return
    // Where its cards are on screen now, so they stay put or stack in that order.
    const positions = Object.fromEntries(getNodes().filter((n) => parentOf(n.data.node) === id).map((n) => [n.id, n.position]))
    setContainerLayout(id, layout, positions)
  }

  return (
    <div
      className={`map-container layout-${node.layout}${dropTarget === id ? ' drop-target' : ''}`}
      style={{ '--box': color, '--title-height': `${TITLE_HEIGHT}px` } as React.CSSProperties}
    >
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={Math.max(MIN.width, min?.width ?? 0)}
        minHeight={Math.max(MIN.height, min?.height ?? 0)}
        lineClassName="map-resize-line"
        handleClassName="map-resize-handle"
        onResizeStart={(_, p) => {
          resizedFrom.current = { width: p.width, height: p.height }
        }}
        onResizeEnd={(_, p) => {
          // Only the sides dragged change its size: a height it grew to around
          // its cards isn't kept when just its width was changed, say.
          const from = resizedFrom.current
          updateMapNode(id, {
            x: Math.round(p.x),
            y: Math.round(p.y),
            width: from && Math.round(from.width) === Math.round(p.width) ? node.width : Math.round(p.width),
            height: from && Math.round(from.height) === Math.round(p.height) ? node.height : Math.round(p.height),
          })
        }}
      />
      <NodeToolbar isVisible={selected && !editing} position={toolbar.position} align={toolbar.align} className="map-toolbar">
        {LAYOUTS.map(({ layout, label, icon: Icon }) => (
          <button
            key={layout}
            className={`map-tool icon-only${node.layout === layout ? ' active' : ''}`}
            onClick={() => setLayout(layout)}
            aria-label={label}
            aria-pressed={node.layout === layout}
            title={label}
          >
            <Icon size={15} />
          </button>
        ))}
        <span className="map-tool-sep" />
        <ColorPicker variant="toolbar" count={6} value={color} onChange={(c) => updateMapNode(id, { color: c })} label="Container colour" />
        <span className="map-tool-sep" />
        <button className="map-tool icon-only" onClick={() => setEditingId(id)} aria-label="Edit title" title="Edit title">
          <PenLine size={14} />
        </button>
        <button
          className="map-tool icon-only"
          onClick={() => removeNode(id)}
          aria-label="Delete container"
          title="Delete container (the cards on it stay)"
        >
          <Trash2 size={14} />
        </button>
      </NodeToolbar>
      <Handles />
      <div className="map-container-head" onDoubleClick={() => setEditingId(id)}>
        {editing ? (
          <MentionTextarea
            ref={input}
            className="map-container-title-input nodrag nopan"
            value={node.title}
            placeholder="Title… Type @ to mention a character."
            aria-label="Container title"
            submitOnEnter
            onChange={(title) => updateMapNode(id, { title })}
            onBlur={() => setEditingId(null)}
          />
        ) : node.title ? (
          <span className="map-container-title">
            <MentionText text={node.title} />
          </span>
        ) : (
          <span className="map-container-title empty">Double-click to add a title</span>
        )}
      </div>
      {!data.count && <span className="map-container-hint">Drop cards here</span>}
    </div>
  )
}
