import { NodeResizer, NodeToolbar, useReactFlow, type NodeProps } from '@xyflow/react'
import { Columns3, LayoutDashboard, Rows3, Trash2, type LucideIcon } from 'lucide-react'
import type { ContainerLayout, MapNode, NoteColor } from '../types'
import { useStory } from '../store/storyStore'
import { NOTE_COLORS, parentOf } from '../store/storyOps'
import { Handles } from './EntityNodes'
import { NOTE_COLOR_VALUES, useMap, useToolbarPlacement, type StoryFlowNode } from './mapShared'

type ContainerMapNode = Extract<MapNode, { kind: 'container' }>

const LAYOUTS: { layout: ContainerLayout; label: string; icon: LucideIcon }[] = [
  { layout: 'vertical', label: 'Stack cards downwards', icon: Rows3 },
  { layout: 'horizontal', label: 'Stack cards side by side', icon: Columns3 },
  { layout: 'free', label: 'Place cards freely', icon: LayoutDashboard },
]

const MIN = { width: 120, height: 80 }

/**
 * A see-through area on the map to put cards on. Cards dropped on it stack
 * down it, or across it, or stay where they're put (freeform); they move
 * with it. Deleting it leaves its cards on the map.
 */
export function ContainerNode({ id, data, selected }: NodeProps<StoryFlowNode>) {
  const node = data.node as ContainerMapNode
  const updateMapNode = useStory((s) => s.updateMapNode)
  const setContainerLayout = useStory((s) => s.setContainerLayout)
  const { removeNode, dropTarget } = useMap()
  const { getNodes } = useReactFlow<StoryFlowNode>()
  const toolbar = useToolbarPlacement(id, selected)
  const stacked = node.layout !== 'free'
  const content = data.content

  const setLayout = (layout: ContainerLayout) => {
    if (layout === node.layout) return
    // Where its cards are on screen now, so they stay put or stack in that order.
    const positions = Object.fromEntries(getNodes().filter((n) => parentOf(n.data.node) === id).map((n) => [n.id, n.position]))
    setContainerLayout(id, layout, positions)
  }

  return (
    <div
      className={`map-container layout-${node.layout}${dropTarget === id ? ' drop-target' : ''}`}
      style={{ '--box': NOTE_COLOR_VALUES[node.color] } as React.CSSProperties}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={stacked ? Math.max(MIN.width, content?.width ?? 0) : MIN.width}
        minHeight={stacked ? Math.max(MIN.height, content?.height ?? 0) : MIN.height}
        lineClassName="map-resize-line"
        handleClassName="map-resize-handle"
        onResizeEnd={(_, p) =>
          updateMapNode(id, { x: Math.round(p.x), y: Math.round(p.y), width: Math.round(p.width), height: Math.round(p.height) })
        }
      />
      <NodeToolbar isVisible={selected} position={toolbar.position} align={toolbar.align} className="map-toolbar">
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
        {NOTE_COLORS.map((color: NoteColor) => (
          <button
            key={color}
            className={`map-swatch${color === node.color ? ' active' : ''}`}
            style={{ background: NOTE_COLOR_VALUES[color] }}
            onClick={() => updateMapNode(id, { color })}
            aria-label={`${color} container`}
            title={color[0].toUpperCase() + color.slice(1)}
          />
        ))}
        <span className="map-tool-sep" />
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
      {!data.count && <span className="map-container-hint">Drop cards here</span>}
    </div>
  )
}
