import { useEffect, useRef } from 'react'
import { NodeResizer, NodeToolbar, type NodeProps } from '@xyflow/react'
import { List, ListChecks, ListOrdered, PenLine, Trash2 } from 'lucide-react'
import type { MapListStyle, MapNode, NoteColor, TextSize } from '../types'
import { useStory } from '../store/storyStore'
import { NOTE_COLORS } from '../store/storyOps'
import { MentionText } from '../components/MentionText'
import { MentionTextarea } from '../components/MentionTextarea'
import { Handles } from './EntityNodes'
import { ListEditor, TextList } from './TextList'
import { toItems } from './listLines'
import { NOTE_COLOR_VALUES, focusSoon, useMap, useToolbarPlacement, type StoryFlowNode } from './mapShared'

type NoteMapNode = Extract<MapNode, { kind: 'note' }>
type TextMapNode = Extract<MapNode, { kind: 'text' }>

const SIZES: { size: TextSize; label: string }[] = [
  { size: 'sm', label: 'S' },
  { size: 'md', label: 'M' },
  { size: 'lg', label: 'L' },
]

const LISTS: { style: MapListStyle; label: string; icon: React.ReactNode }[] = [
  { style: 'bullet', label: 'Bulleted list', icon: <List size={15} /> },
  { style: 'number', label: 'Numbered list', icon: <ListOrdered size={15} /> },
  { style: 'check', label: 'Checklist', icon: <ListChecks size={15} /> },
]

/** Shared editing behaviour: double-click to write, click away or Escape to stop. */
function useEditing(id: string) {
  const { editingId, setEditingId, removeNode } = useMap()
  const editing = editingId === id
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => (editing ? focusSoon(() => input.current) : undefined), [editing])

  return {
    editing,
    input,
    start: () => setEditingId(id),
    stop: () => setEditingId(null),
    remove: () => removeNode(id),
  }
}

export function NoteNode({ id, data, selected }: NodeProps<StoryFlowNode>) {
  const node = data.node as NoteMapNode
  const updateMapNode = useStory((s) => s.updateMapNode)
  const { editing, input, start, stop, remove } = useEditing(id)
  const toolbar = useToolbarPlacement(id, selected)

  return (
    <div
      className={`map-note${editing ? ' editing' : ''}`}
      style={{ background: NOTE_COLOR_VALUES[node.color] }}
      onDoubleClick={start}
    >
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={120}
        minHeight={80}
        lineClassName="map-resize-line"
        handleClassName="map-resize-handle"
        onResizeEnd={(_, p) => updateMapNode(id, { x: p.x, y: p.y, width: p.width, height: p.height })}
      />
      <NodeToolbar isVisible={selected && !editing} position={toolbar.position} align={toolbar.align} className="map-toolbar">
        {NOTE_COLORS.map((color: NoteColor) => (
          <button
            key={color}
            className={`map-swatch${color === node.color ? ' active' : ''}`}
            style={{ background: NOTE_COLOR_VALUES[color] }}
            onClick={() => updateMapNode(id, { color })}
            aria-label={`${color} note`}
            title={color[0].toUpperCase() + color.slice(1)}
          />
        ))}
        <span className="map-tool-sep" />
        <button className="map-tool" onClick={start}>
          <PenLine size={14} /> Edit
        </button>
        <button className="map-tool" onClick={remove}>
          <Trash2 size={14} /> Delete
        </button>
      </NodeToolbar>
      <Handles />
      {editing ? (
        <div className="map-note-scroll nodrag nopan nowheel">
          <MentionTextarea
            ref={input}
            className="map-note-input"
            value={node.text}
            placeholder="Write a note… Type @ to mention a character."
            aria-label="Note"
            onChange={(text) => updateMapNode(id, { text })}
            onBlur={stop}
          />
        </div>
      ) : (
        <div className="map-note-text">
          {node.text ? <MentionText text={node.text} /> : <span className="map-placeholder">Double-click to write</span>}
        </div>
      )}
    </div>
  )
}

export function TextNode({ id, data, selected }: NodeProps<StoryFlowNode>) {
  const node = data.node as TextMapNode
  const updateMapNode = useStory((s) => s.updateMapNode)
  const { editing, input, start, stop, remove } = useEditing(id)
  const toolbar = useToolbarPlacement(id, selected)

  const setList = (style: MapListStyle) => {
    if (node.list === style) updateMapNode(id, { list: undefined, checked: undefined })
    else if (node.list) updateMapNode(id, { list: style })
    else updateMapNode(id, { list: style, text: toItems(node.text) })
  }

  return (
    <div
      className={`map-text size-${node.size}${node.bg ? ' has-bg' : ''}${editing ? ' editing' : ''}${selected ? ' selected' : ''}`}
      style={node.bg ? { background: NOTE_COLOR_VALUES[node.bg] } : undefined}
      onDoubleClick={start}
    >
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={80}
        minHeight={30}
        lineClassName="map-resize-line"
        handleClassName="map-resize-handle"
        onResizeEnd={(_, p) => updateMapNode(id, { x: p.x, y: p.y, width: p.width })}
      />
      <NodeToolbar isVisible={selected && !editing} position={toolbar.position} align={toolbar.align} className="map-toolbar">
        {SIZES.map((s) => (
          <button
            key={s.size}
            className={`map-tool size-btn${s.size === node.size ? ' active' : ''}`}
            onClick={() => updateMapNode(id, { size: s.size })}
            aria-label={`Text size ${s.label}`}
            title={`Text size ${s.label}`}
          >
            {s.label}
          </button>
        ))}
        <span className="map-tool-sep" />
        <button
          className={`map-swatch none${node.bg ? '' : ' active'}`}
          onClick={() => updateMapNode(id, { bg: undefined })}
          aria-label="No background"
          title="No background"
        />
        {NOTE_COLORS.map((color) => (
          <button
            key={color}
            className={`map-swatch${color === node.bg ? ' active' : ''}`}
            style={{ background: NOTE_COLOR_VALUES[color] }}
            onClick={() => updateMapNode(id, { bg: color })}
            aria-label={`${color} background`}
            title={`${color[0].toUpperCase() + color.slice(1)} background`}
          />
        ))}
        <span className="map-tool-sep" />
        {LISTS.map((l) => (
          <button
            key={l.style}
            className={`map-tool icon-only${node.list === l.style ? ' active' : ''}`}
            onClick={() => setList(l.style)}
            aria-pressed={node.list === l.style}
            aria-label={l.label}
            title={l.label}
          >
            {l.icon}
          </button>
        ))}
        <span className="map-tool-sep" />
        <button className="map-tool icon-only" onClick={start} aria-label="Edit" title="Edit">
          <PenLine size={14} />
        </button>
        <button className="map-tool icon-only" onClick={remove} aria-label="Delete" title="Delete">
          <Trash2 size={14} />
        </button>
      </NodeToolbar>
      <Handles />
      {editing ? (
        node.list ? (
          <ListEditor node={node} onDone={stop} />
        ) : (
          <MentionTextarea
            ref={input}
            className="map-text-input nodrag nopan nowheel"
            value={node.text}
            placeholder="Type here…"
            aria-label="Text"
            onChange={(text) => updateMapNode(id, { text })}
            onBlur={stop}
          />
        )
      ) : node.text && node.list ? (
        <TextList node={node} />
      ) : (
        <div className="map-text-body">
          {node.text ? <MentionText text={node.text} /> : <span className="map-placeholder">Double-click to type</span>}
        </div>
      )}
    </div>
  )
}
