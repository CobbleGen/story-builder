import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type EdgeChange,
  type FitViewOptions,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './map.css'
import { PanelLeftOpen } from 'lucide-react'
import type { MapNode } from '../types'
import { useStory } from '../store/storyStore'
import { anchorOfHandle } from '../lib/anchors'
import { useUi } from '../store/uiStore'
import { ArcNode, BeatNode, ChapterNode, CharacterNode } from './EntityNodes'
import { NoteNode, TextNode } from './NoteNodes'
import { StoryEdge, type StoryFlowEdge } from './StoryEdge'
import { MapPalette } from './MapPalette'
import {
  DRAG_MIME,
  MapContext,
  NEW_NODE_CENTER,
  NOTE_COLOR_VALUES,
  newNodeFor,
  type PaletteItem,
  type StoryFlowNode,
} from './mapShared'

const nodeTypes = {
  arc: ArcNode,
  chapter: ChapterNode,
  character: CharacterNode,
  beat: BeatNode,
  note: NoteNode,
  text: TextNode,
}
const edgeTypes = { story: StoryEdge }

// Fitting the story into view leaves the bottom clear for the minimap and
// zoom buttons (phones don't show the minimap).
const FIT_VIEW: FitViewOptions = {
  maxZoom: 1,
  padding:
    typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
      ? { x: '20px', top: '20px', bottom: '70px' }
      : { x: '48px', top: '40px', bottom: '150px' },
}

/** Story map nodes as React Flow nodes, keeping React Flow's own state (selection, sizes). */
function toFlow(mapNodes: MapNode[], prev: StoryFlowNode[]): StoryFlowNode[] {
  const old = new Map(prev.map((n) => [n.id, n]))
  return mapNodes.map((n) => {
    const was = old.get(n.id)
    const node: StoryFlowNode = {
      id: n.id,
      type: n.kind,
      position: { x: n.x, y: n.y },
      data: { node: n },
      selected: was?.selected ?? false,
      measured: was?.measured,
      // Notes sit under the other cards; an opened-up card sits over its neighbours.
      zIndex: n.kind === 'note' ? 0 : 'expanded' in n && n.expanded ? 2 : 1,
    }
    if (n.kind === 'note') return { ...node, width: n.width, height: n.height }
    if (n.kind === 'text') return { ...node, width: n.width }
    // An opened-up card keeps the size it was given for that view.
    const size = n.expanded ? n.sizes?.[n.expanded] : undefined
    return size ? { ...node, width: size.width, height: size.height } : node
  })
}

/** The nearest place to (x, y) where a w × h card doesn't overlap another card. */
function freeSpot(nodes: StoryFlowNode[], x: number, y: number, w: number, h: number) {
  const gap = 24
  const rects = nodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    w: n.measured?.width ?? n.width ?? 240,
    h: n.measured?.height ?? n.height ?? 120,
  }))
  const free = (px: number, py: number) =>
    !rects.some((r) => px < r.x + r.w + gap && px + w + gap > r.x && py < r.y + r.h + gap && py + h + gap > r.y)
  if (free(x, y)) return { x, y }
  for (let ring = 1; ring <= 30; ring++) {
    const steps = ring * 8
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2
      const px = x + Math.cos(a) * ring * 60
      const py = y + Math.sin(a) * ring * 45
      if (free(px, py)) return { x: px, y: py }
    }
  }
  return { x, y }
}

export default function MapPage() {
  return (
    <ReactFlowProvider>
      <MapCanvas />
    </ReactFlowProvider>
  )
}

function MapCanvas() {
  const mindMap = useStory((s) => s.mindMap)
  const addMapNode = useStory((s) => s.addMapNode)
  const moveMapNodes = useStory((s) => s.moveMapNodes)
  const removeMapNodes = useStory((s) => s.removeMapNodes)
  const addMapEdge = useStory((s) => s.addMapEdge)
  const removeMapEdges = useStory((s) => s.removeMapEdges)
  const paletteOpen = useUi((s) => s.mapPaletteOpen)
  const togglePalette = useUi((s) => s.toggleMapPalette)
  const setMapViewport = useUi((s) => s.setMapViewport)
  const openBeat = useUi((s) => s.openBeat)
  // Where the map was left last time; read once, so panning doesn't re-render the page.
  const [savedViewport] = useState(() => useUi.getState().mapViewport)
  const navigate = useNavigate()
  const { screenToFlowPosition, deleteElements } = useReactFlow()
  const wrapper = useRef<HTMLDivElement>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [edgeSelection, setEdgeSelection] = useState<Record<string, boolean>>({})

  // React Flow keeps its own copy of the nodes for dragging and selection; it
  // follows the story whenever the map there changes.
  const [nodes, setNodes] = useState<StoryFlowNode[]>(() => toFlow(mindMap.nodes, []))
  const [synced, setSynced] = useState(mindMap.nodes)
  if (synced !== mindMap.nodes) {
    setSynced(mindMap.nodes)
    setNodes((prev) => toFlow(mindMap.nodes, prev))
  }

  const edges = useMemo<StoryFlowEdge[]>(
    () =>
      mindMap.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'story',
        data: { edge: e },
        selected: !!edgeSelection[e.id],
        markerEnd: e.arrow ? { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#8f897f' } : undefined,
      })),
    [mindMap.edges, edgeSelection],
  )

  const onMap = useMemo(
    () => new Set(mindMap.nodes.flatMap((n) => ('refId' in n ? [n.refId] : []))),
    [mindMap.nodes],
  )

  const onNodesChange = useCallback((changes: NodeChange<StoryFlowNode>[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev))
  }, [])

  const onEdgesChange = useCallback(
    (changes: EdgeChange<StoryFlowEdge>[]) => {
      const selects = changes.filter((c) => c.type === 'select')
      if (selects.length) {
        setEdgeSelection((prev) => {
          const next = { ...prev }
          for (const c of selects) next[c.id] = c.selected
          return next
        })
      }
      const removed = changes.flatMap((c) => (c.type === 'remove' ? [c.id] : []))
      if (removed.length) removeMapEdges(removed)
    },
    [removeMapEdges],
  )

  const addAt = useCallback(
    (item: PaletteItem, clientX: number, clientY: number) => {
      const p = screenToFlowPosition({ x: clientX, y: clientY })
      const c = NEW_NODE_CENTER[item.kind]
      const id = addMapNode(newNodeFor(item, Math.round(p.x - c.x), Math.round(p.y - c.y)))
      if (id && (item.kind === 'note' || item.kind === 'text')) setEditingId(id)
    },
    [addMapNode, screenToFlowPosition],
  )

  /** Clicked in the palette: add it near the middle of the view, in a free spot. */
  const addInView = (item: PaletteItem) => {
    const r = wrapper.current?.getBoundingClientRect()
    if (!r) return
    const c = NEW_NODE_CENTER[item.kind]
    const middle = screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    const spot = freeSpot(nodes, middle.x - c.x, middle.y - c.y, c.x * 2, c.y * 2)
    const id = addMapNode(newNodeFor(item, Math.round(spot.x), Math.round(spot.y)))
    if (id && (item.kind === 'note' || item.kind === 'text')) setEditingId(id)
    // On a phone the panel covers the map; get it out of the way of the new card.
    if (window.matchMedia('(max-width: 760px)').matches) togglePalette()
  }

  const openItem = useCallback(
    (node: MapNode) => {
      if (node.kind === 'arc') navigate(`/arcs/${node.refId}`)
      else if (node.kind === 'character') navigate(`/characters/${node.refId}`)
      else if (node.kind === 'chapter') navigate(`/write/${node.refId}`)
      else if (node.kind === 'beat') openBeat(node.refId)
      else setEditingId(node.id)
    },
    [navigate, openBeat],
  )

  const context = useMemo(
    () => ({
      editingId,
      setEditingId,
      openItem,
      removeNode: (id: string) => void deleteElements({ nodes: [{ id }] }),
    }),
    [editingId, openItem, deleteElements],
  )

  return (
    <MapContext.Provider value={context}>
      <div className="map-page">
        {paletteOpen ? (
          <MapPalette onMap={onMap} onAdd={addInView} />
        ) : (
          <button className="beats-rail" onClick={togglePalette} title="Show the panel" aria-label="Show the add to map panel">
            <PanelLeftOpen size={18} />
          </button>
        )}
        <div
          ref={wrapper}
          className={`map-canvas${connecting ? ' connecting' : ''}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(DRAG_MIME)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData(DRAG_MIME)
            if (!raw) return
            e.preventDefault()
            addAt(JSON.parse(raw) as PaletteItem, e.clientX, e.clientY)
          }}
          onDoubleClick={(e) => {
            // Double-click on empty canvas: a new sticky note right there.
            if ((e.target as Element).classList.contains('react-flow__pane')) addAt({ kind: 'note' }, e.clientX, e.clientY)
          }}
        >
          <ReactFlow<StoryFlowNode, StoryFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={(_, __, dragged) =>
              moveMapNodes(
                Object.fromEntries(dragged.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }])),
              )
            }
            onNodesDelete={(deleted) => removeMapNodes(deleted.map((n) => n.id))}
            onConnect={(c) =>
              addMapEdge(c.source, c.target, { source: anchorOfHandle(c.sourceHandle), target: anchorOfHandle(c.targetHandle) })
            }
            onConnectStart={() => setConnecting(true)}
            onConnectEnd={(event, state) => {
              setConnecting(false)
              // Not dropped on a connection point: join whatever card, or row in a card, is under the pointer.
              if (state.isValid || !state.fromNode) return
              const point = 'changedTouches' in event ? event.changedTouches[0] : event
              const hit = document.elementFromPoint(point.clientX, point.clientY)
              const card = hit?.closest<HTMLElement>('.react-flow__node')
              const toId = card?.dataset.id
              if (!toId) return
              const row = hit?.closest<HTMLElement>('[data-anchor]')
              addMapEdge(state.fromNode.id, toId, {
                source: anchorOfHandle(state.fromHandle?.id),
                target: row && card.contains(row) ? row.dataset.anchor : undefined,
              })
            }}
            onNodeDoubleClick={(e, n) => {
              // Not from inside an opened-up card (its lists and pages have their own clicks).
              if ((e.target as Element).closest('.nodrag')) return
              if (n.data.node.kind !== 'note' && n.data.node.kind !== 'text') openItem(n.data.node)
            }}
            onMoveEnd={(_, viewport) => setMapViewport(viewport)}
            onPaneClick={() => setEditingId(null)}
            defaultViewport={savedViewport ?? undefined}
            fitView={!savedViewport}
            fitViewOptions={FIT_VIEW}
            connectionMode={ConnectionMode.Loose}
            // In map units: near a dot snaps to it; anywhere else on a card or row joins that.
            connectionRadius={24}
            zoomOnDoubleClick={false}
            deleteKeyCode={['Backspace', 'Delete']}
            minZoom={0.1}
            maxZoom={2.5}
            attributionPosition="top-right"
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="#cfc9bd" />
            <Controls showInteractive={false} position="bottom-right" fitViewOptions={FIT_VIEW} />
            <MiniMap
              pannable
              zoomable
              position="bottom-left"
              style={{ width: 168, height: 112 }}
              nodeColor={(n) => {
                const node = (n as StoryFlowNode).data.node
                if (node.kind === 'note') return node.color === 'white' ? '#e4e0d7' : NOTE_COLOR_VALUES[node.color]
                return node.kind === 'text' ? 'transparent' : '#d6d1c6'
              }}
              maskColor="rgba(239, 236, 229, 0.7)"
            />
          </ReactFlow>
          {nodes.length === 0 && (
            <div className="map-empty">
              <strong>Your mind map is empty</strong>
              <span>
                Drag chapters, arcs, characters and beats here from the left, or double-click anywhere for a sticky
                note.
              </span>
            </div>
          )}
        </div>
      </div>
    </MapContext.Provider>
  )
}
