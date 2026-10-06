import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
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
  useNodesInitialized,
  useReactFlow,
  useStoreApi,
  type EdgeChange,
  type FitViewOptions,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './map.css'
import { PanelLeftOpen } from 'lucide-react'
import type { MapNode, MindMap } from '../types'
import { useStory } from '../store/storyStore'
import { CONTAINER_COLOR, NOTE_COLOR, parentOf, type NewMapNode } from '../store/storyOps'
import { anchorOfHandle } from '../lib/anchors'
import { useResolvedTheme } from '../lib/theme'
import { useUi } from '../store/uiStore'
import { ArcNode, BeatNode, ChapterNode, CharacterNode, ElementNode } from './EntityNodes'
import { NoteNode, TextNode } from './NoteNodes'
import { PictureNode } from './PictureNode'
import { ContainerNode } from './ContainerNode'
import { arrange, depths, placeOnContainer, planDrops, withEverythingOn } from './containers'
import { addPicture, picturesIn } from '../lib/pictures'
import { askConfirm } from '../lib/confirm'
import { StoryEdge, type StoryFlowEdge } from './StoryEdge'
import { MapPalette } from './MapPalette'
import { MapSwitcher } from './MapSwitcher'
import { useMapClipboard } from './useMapClipboard'
import {
  DRAG_MIME,
  MapContext,
  NEW_NODE_CENTER,
  paint,
  newNodeFor,
  type PaletteItem,
  type StoryFlowNode,
} from './mapShared'

const nodeTypes = {
  arc: ArcNode,
  chapter: ChapterNode,
  character: CharacterNode,
  element: ElementNode,
  beat: BeatNode,
  note: NoteNode,
  text: TextNode,
  image: PictureNode,
  container: ContainerNode,
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

/**
 * How the map stacks, bottom up: containers (one on another above it), lines,
 * then sticky notes and pictures (often used as a backdrop), then cards, and
 * an opened-up card over its neighbours. So lines pass under everything but
 * the cards they join (StoryEdge draws that bit on top), and over
 * containers. A selected card is lifted over the rest; a selected container
 * isn't, so it stays under what's on it.
 */
const LAYER = { container: -1000, line: 1, backdrop: 2, card: 3, opened: 4 }
const LIFT = 1000

/** Each card's place in the stack (see LAYER), for React Flow to draw them in. Returns `nodes` if none changed. */
function layered(nodes: StoryFlowNode[]): StoryFlowNode[] {
  const depth = nodes.some((n) => n.type === 'container') ? depths(nodes) : null
  let changed = false
  const next = nodes.map((n) => {
    const z = n.type === 'container' ? LAYER.container + (depth?.get(n.id) ?? 0) : layerOf(n.data.node) + (n.selected ? LIFT : 0)
    if (n.zIndex === z) return n
    changed = true
    return { ...n, zIndex: z }
  })
  return changed ? next : nodes
}

const isBackdrop = (n: MapNode) => n.kind === 'note' || n.kind === 'image'
const layerOf = (n: MapNode) =>
  n.kind === 'container'
    ? LAYER.container
    : isBackdrop(n)
      ? LAYER.backdrop
      : 'expanded' in n && n.expanded
        ? LAYER.opened
        : LAYER.card

/**
 * Story map nodes as React Flow nodes, keeping React Flow's own state
 * (selection, sizes). `select`, when given, is the new selection.
 */
function toFlow(mapNodes: MapNode[], prev: StoryFlowNode[], select?: Set<string> | null): StoryFlowNode[] {
  const old = new Map(prev.map((n) => [n.id, n]))
  return mapNodes.map((n) => {
    const was = old.get(n.id)
    const node: StoryFlowNode = {
      id: n.id,
      type: n.kind,
      position: { x: n.x, y: n.y },
      data: { node: n },
      selected: select ? select.has(n.id) : (was?.selected ?? false),
      measured: was?.measured,
      zIndex: layerOf(n),
    }
    if (isBackdrop(n) || n.kind === 'container') return { ...node, width: n.width, height: n.height }
    if (n.kind === 'text') return { ...node, width: n.width }
    // An opened-up card keeps the size it was given for that view.
    const size = n.expanded ? n.sizes?.[n.expanded] : undefined
    return size ? { ...node, width: size.width, height: size.height } : node
  })
}

/** New cards that open ready to write in: a note's or text box's text, a container's title. */
const WRITTEN_FIRST = new Set<PaletteItem['kind']>(['note', 'text', 'container'])

/** A new picture's size on the map: as it is, unless that's bigger than a large card. */
function pictureSize(width: number, height: number) {
  const scale = Math.min(1, 320 / width, 320 / height)
  return { width: Math.max(40, Math.round(width * scale)), height: Math.max(40, Math.round(height * scale)) }
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

/** The mind map in the address (/map/:mapId), else the last one opened, else the first. */
export default function MapPage() {
  const { mapId } = useParams()
  const maps = useStory((s) => s.mindMaps)
  const lastMapId = useUi((s) => s.lastMapId)
  const setLastMapId = useUi((s) => s.setLastMapId)
  const current = maps.find((m) => m.id === mapId)
  const fallback = maps.find((m) => m.id === lastMapId) ?? maps[0]

  useEffect(() => {
    if (current && current.id !== lastMapId) setLastMapId(current.id)
  }, [current, lastMapId, setLastMapId])

  if (!current) return fallback ? <Navigate to={`/map/${fallback.id}`} replace /> : null
  // Each map gets its own canvas, so switching maps starts from that map's view.
  return (
    <ReactFlowProvider key={current.id}>
      <MapCanvas mindMap={current} />
    </ReactFlowProvider>
  )
}

function MapCanvas({ mindMap }: { mindMap: MindMap }) {
  const addMapNode = useStory((s) => s.addMapNode)
  const dropMapNodes = useStory((s) => s.dropMapNodes)
  const removeMapNodes = useStory((s) => s.removeMapNodes)
  const addMapEdge = useStory((s) => s.addMapEdge)
  const removeMapEdges = useStory((s) => s.removeMapEdges)
  const paletteOpen = useUi((s) => s.mapPaletteOpen)
  const togglePalette = useUi((s) => s.toggleMapPalette)
  const setMapViewport = useUi((s) => s.setMapViewport)
  const openBeat = useUi((s) => s.openBeat)
  // Where the map was left last time; read once, so panning doesn't re-render the page.
  const [savedViewport] = useState(() => useUi.getState().mapViewports[mindMap.id] ?? null)
  const navigate = useNavigate()
  const location = useLocation()
  const { screenToFlowPosition, deleteElements, fitView } = useReactFlow()
  const flowStore = useStoreApi<StoryFlowNode, StoryFlowEdge>()
  const wrapper = useRef<HTMLDivElement>(null)

  const dark = useResolvedTheme() === 'dark'
  const [editingId, setEditingId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [edgeSelection, setEdgeSelection] = useState<Record<string, boolean>>({})

  // React Flow keeps its own copy of the nodes for dragging and selection; it
  // follows the story whenever the map there changes.
  const [nodes, setNodes] = useState<StoryFlowNode[]>(() => toFlow(mindMap.nodes, []))
  // The latest cards, for work that finishes later (pictures still being read).
  const nodesRef = useRef(nodes)
  useEffect(() => {
    nodesRef.current = nodes
  })
  const [synced, setSynced] = useState(mindMap.nodes)
  // Cards just pasted, to select once they're on the map.
  const [selectNext, setSelectNext] = useState<Set<string> | null>(null)
  if (synced !== mindMap.nodes) {
    setSynced(mindMap.nodes)
    setNodes((prev) => layered(arrange(toFlow(mindMap.nodes, prev, selectNext))))
    if (selectNext) {
      setSelectNext(null)
      setEdgeSelection({})
    }
  }

  const edges = useMemo<StoryFlowEdge[]>(
    () =>
      mindMap.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'story',
        data: { edge: e },
        zIndex: LAYER.line,
        selected: !!edgeSelection[e.id],
        markerEnd: e.arrow ? { type: MarkerType.ArrowClosed, width: 16, height: 16, color: dark ? '#8c867b' : '#8f897f' } : undefined,
      })),
    [mindMap.edges, edgeSelection, dark],
  )

  // Opened from a search result: select the card and bring it to the middle.
  const searched = (location.state as { focusNode?: string } | null)?.focusNode
  const measured = useNodesInitialized()
  useEffect(() => {
    if (!searched || !measured) return
    flowStore.getState().addSelectedNodes([searched])
    void fitView({ nodes: [{ id: searched }], maxZoom: 1, minZoom: 0.5, duration: 400, padding: 0.3 })
    navigate('.', { replace: true, state: null })
  }, [searched, measured, flowStore, fitView, navigate, location.key])

  const onMap = useMemo(
    () => new Set(mindMap.nodes.flatMap((n) => ('refId' in n ? [n.refId] : []))),
    [mindMap.nodes],
  )

  // What's on containers is laid out again whenever anything moves, changes size or is selected.
  const onNodesChange = useCallback((changes: NodeChange<StoryFlowNode>[]) => {
    setNodes((prev) => layered(arrange(applyNodeChanges(changes, prev))))
  }, [])

  // While a card is dragged, the container it would go onto (the one under the pointer) shows it.
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const pointerAt = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const p = 'changedTouches' in event ? event.changedTouches[0] : event
      return screenToFlowPosition({ x: p.clientX, y: p.clientY })
    },
    [screenToFlowPosition],
  )
  const showDropTarget = useCallback(
    (event: MouseEvent | TouchEvent, _held: StoryFlowNode, dragged: StoryFlowNode[]) => {
      const point = pointerAt(event)
      const skip = withEverythingOn(nodesRef.current, dragged.map((n) => n.id))
      setDropTarget(placeOnContainer(nodesRef.current, point, point, skip).containerId ?? null)
    },
    [pointerAt],
  )

  /**
   * Taking cards off the map; the cards on a container that goes stay where
   * they're shown, on the container that one was on (if any). Asked for by
   * the Delete key, a card's own delete button, or cutting.
   */
  const removeCards = useCallback(
    (ids: string[]) => {
      const gone = new Set(ids)
      const byId = new Map(nodesRef.current.map((n) => [n.id, n]))
      const place: Record<string, { x: number; y: number }> = {}
      for (const n of nodesRef.current) {
        let parent = byId.get(parentOf(n.data.node) ?? '')
        if (gone.has(n.id) || !parent || !gone.has(parent.id)) continue
        while (parent && gone.has(parent.id)) parent = byId.get(parentOf(parent.data.node) ?? '')
        place[n.id] = parent ? { x: n.position.x - parent.position.x, y: n.position.y - parent.position.y } : n.position
      }
      removeMapNodes(ids, place)
    },
    [removeMapNodes],
  )

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
      const node = newNodeFor(item, Math.round(p.x - c.x), Math.round(p.y - c.y))
      // Dropped on a container: it goes on it, where it was dropped.
      const { containerId, before, x, y } = placeOnContainer(nodesRef.current, p, node)
      const id = addMapNode((containerId ? { ...node, x, y, containerId } : node) as NewMapNode, mindMap.id, before ?? null)
      if (id && WRITTEN_FIRST.has(item.kind)) setEditingId(id)
    },
    [addMapNode, screenToFlowPosition, mindMap.id],
  )

  /** Clicked in the palette: add it near the middle of the view, in a free spot. */
  const addInView = (item: PaletteItem) => {
    const r = wrapper.current?.getBoundingClientRect()
    if (!r) return
    const c = NEW_NODE_CENTER[item.kind]
    const middle = screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    const spot = freeSpot(nodes, middle.x - c.x, middle.y - c.y, c.x * 2, c.y * 2)
    const id = addMapNode(newNodeFor(item, Math.round(spot.x), Math.round(spot.y)), mindMap.id)
    if (id && WRITTEN_FIRST.has(item.kind)) setEditingId(id)
    // On a phone the panel covers the map; get it out of the way of the new card.
    if (window.matchMedia('(max-width: 760px)').matches) togglePalette()
  }

  /**
   * Adds pictures to the map: where they were dropped, or else in a free spot
   * in the middle of the view. Several are fanned out a little.
   */
  const addPictures = useCallback(
    async (files: File[], drop?: { x: number; y: number }) => {
      const r = wrapper.current?.getBoundingClientRect()
      const at = screenToFlowPosition(drop ?? { x: (r?.left ?? 0) + (r?.width ?? 0) / 2, y: (r?.top ?? 0) + (r?.height ?? 0) / 2 })
      let shift = 0
      for (const file of files) {
        try {
          const picture = await addPicture(file)
          const size = pictureSize(picture.width, picture.height)
          let x = at.x - size.width / 2 + shift
          let y = at.y - size.height / 2 + shift
          if (!drop) ({ x, y } = freeSpot(nodesRef.current, x, y, size.width, size.height))
          const node: NewMapNode = { kind: 'image', imageId: picture.id, x: Math.round(x), y: Math.round(y), ...size }
          const on = drop ? placeOnContainer(nodesRef.current, at, node) : null
          addMapNode(on?.containerId ? { ...node, x: on.x, y: on.y, containerId: on.containerId } : node, mindMap.id, on?.before ?? null)
          shift += 28
        } catch (error) {
          await askConfirm({
            title: 'That picture couldn’t be added',
            message: error instanceof Error ? error.message : undefined,
            notice: true,
          })
        }
      }
    },
    [addMapNode, screenToFlowPosition, mindMap.id],
  )

  // Ctrl+C, Ctrl+X and Ctrl+V for cards; pasting a picture (copied from anywhere) puts it on the map.
  const pastePictures = useCallback((files: File[]) => void addPictures(files), [addPictures])
  useMapClipboard({ mapId: mindMap.id, wrapper, addPictures: pastePictures, select: setSelectNext })

  const openItem = useCallback(
    (node: MapNode) => {
      if (node.kind === 'arc') navigate(`/arcs/${node.refId}`)
      else if (node.kind === 'character') navigate(`/characters/${node.refId}`)
      else if (node.kind === 'element') navigate(`/elements/${node.refId}`)
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
      dropTarget,
    }),
    [editingId, openItem, deleteElements, dropTarget],
  )

  return (
    <MapContext.Provider value={context}>
      <div className="map-page">
        {paletteOpen ? (
          <MapPalette onMap={onMap} onAdd={addInView} onAddPictures={(files) => void addPictures(files)} />
        ) : (
          <button className="beats-rail" onClick={togglePalette} title="Show the panel" aria-label="Show the add to map panel">
            <PanelLeftOpen size={18} />
          </button>
        )}
        <div
          ref={wrapper}
          className={`map-canvas${connecting ? ' connecting' : ''}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(DRAG_MIME) && !e.dataTransfer.types.includes('Files')) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            const files = picturesIn(e.dataTransfer)
            if (files.length) {
              e.preventDefault()
              void addPictures(files, { x: e.clientX, y: e.clientY })
              return
            }
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
            // Stacking is ours (see layered): React Flow's lift for the selected would put a container over what's on it.
            zIndexMode="manual"
            onNodeDrag={showDropTarget}
            onNodeDragStop={(event, held, dragged) => {
              setDropTarget(null)
              dropMapNodes(planDrops(nodesRef.current, dragged, { id: held.id, point: pointerAt(event) }))
            }}
            onNodesDelete={(deleted) => removeCards(deleted.map((n) => n.id))}
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
              if ('refId' in n.data.node) openItem(n.data.node)
            }}
            onMoveEnd={(_, viewport) => setMapViewport(mindMap.id, viewport)}
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
            colorMode={dark ? 'dark' : 'light'}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color={dark ? '#3a3732' : '#cfc9bd'} />
            <Controls showInteractive={false} position="bottom-right" fitViewOptions={FIT_VIEW} />
            <MiniMap
              pannable
              zoomable
              position="bottom-left"
              style={{ width: 168, height: 112 }}
              nodeColor={(n) => {
                const node = (n as StoryFlowNode).data.node
                if (node.kind === 'note') return paint(node.color, NOTE_COLOR)
                if (node.kind === 'image') return dark ? '#5a554d' : '#bdb6a8'
                if (node.kind === 'container') return `${paint(node.color, CONTAINER_COLOR)}73`
                return node.kind === 'text' ? 'transparent' : dark ? '#4a463f' : '#d6d1c6'
              }}
              maskColor={dark ? 'rgba(23, 22, 20, 0.7)' : 'rgba(239, 236, 229, 0.7)'}
            />
          </ReactFlow>
          <MapSwitcher map={mindMap} />
          {nodes.length === 0 && (
            <div className="map-empty">
              <strong>Your mind map is empty</strong>
              <span>
                Drag chapters, arcs, characters, places and beats here from the left, drop or paste pictures, or
                double-click anywhere for a sticky note.
              </span>
            </div>
          )}
        </div>
      </div>
    </MapContext.Provider>
  )
}
