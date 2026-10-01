import { useState } from 'react'
import { NodeResizer, NodeToolbar, type NodeProps } from '@xyflow/react'
import { ImageOff, Maximize2, X } from 'lucide-react'
import type { MapNode } from '../types'
import { useStory } from '../store/storyStore'
import { useImageUrl } from '../store/images'
import { PictureViewer } from '../components/PictureViewer'
import { Handles } from './EntityNodes'
import { useMap, useToolbarPlacement, type StoryFlowNode } from './mapShared'

type PictureMapNode = Extract<MapNode, { kind: 'image' }>

/** A picture on the mind map: resized from its corners (keeping its shape), joined to things by lines. */
export function PictureNode({ id, data, selected }: NodeProps<StoryFlowNode>) {
  const node = data.node as PictureMapNode
  const url = useImageUrl(node.imageId)
  const updateMapNode = useStory((s) => s.updateMapNode)
  const { removeNode } = useMap()
  const toolbar = useToolbarPlacement(id, selected)
  const [viewing, setViewing] = useState(false)

  return (
    <div className={`map-picture-card${url ? '' : ' empty'}`} onDoubleClick={() => url && setViewing(true)}>
      <NodeResizer
        isVisible={selected}
        keepAspectRatio
        minWidth={40}
        minHeight={40}
        lineClassName="map-resize-line"
        handleClassName="map-resize-handle"
        onResizeEnd={(_, p) =>
          updateMapNode(id, { x: Math.round(p.x), y: Math.round(p.y), width: Math.round(p.width), height: Math.round(p.height) })
        }
      />
      <NodeToolbar isVisible={selected} position={toolbar.position} align={toolbar.align} className="map-toolbar">
        <button className="map-tool" onClick={() => setViewing(true)} disabled={!url}>
          <Maximize2 size={14} /> Full size
        </button>
        <button className="map-tool" onClick={() => removeNode(id)} title="Remove the picture from the map">
          <X size={14} /> Remove from map
        </button>
      </NodeToolbar>
      <Handles />
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : url === null ? (
        <span className="map-picture-missing">
          <ImageOff size={18} /> Picture not found
        </span>
      ) : null}
      {viewing && <PictureViewer imageId={node.imageId} onClose={() => setViewing(false)} />}
    </div>
  )
}
