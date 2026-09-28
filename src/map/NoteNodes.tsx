import { useEffect, useRef } from 'react'
import { NodeResizer, NodeToolbar, type NodeProps } from '@xyflow/react'
import { PenLine, Trash2 } from 'lucide-react'
import type { MapNode, NoteColor, TextSize } from '../types'
import { useStory } from '../store/storyStore'
import { NOTE_COLORS } from '../store/storyOps'
import { MentionText } from '../components/MentionText'
import { MentionTextarea } from '../components/MentionTextarea'
import { Handles } from './EntityNodes'
import { NOTE_COLOR_VALUES, useMap, useToolbarSide, type StoryFlowNode } from './mapShared'

type NoteMapNode = Extract<MapNode, { kind: 'note' }>
type TextMapNode = Extract<MapNode, { kind: 'text' }>

const SIZES: { size: TextSize; label: string }[] = [
  { size: 'sm', label: 'S' },
  { size: 'md', label: 'M' },
  { size: 'lg', label: 'L' },
]

/** Shared editing behaviour: double-click to write, click away or Escape to stop. */
function useEditing(id: string) {
  const { editingId, setEditingId, removeNode } = useMap()
  const editing = editingId === id
  const input = useRef<HTMLTextAreaElement>(null)

  // Put the caret at the end once the card is on screen (a new card stays
  // hidden until React Flow has measured it, and hidden fields can't take focus).
  useEffect(() => {
    if (!editing) return
    let frame = 0
    let tries = 0
    const focus = () => {
      const el = input.current
      if (!el) return
      el.focus({ preventScroll: true })
      if (document.activeElement === el) el.setSelectionRange(el.value.length, el.value.length)
      else if (tries++ < 20) frame = requestAnimationFrame(focus)
    }
    focus()
    return () => cancelAnimationFrame(frame)
  }, [editing])

  return {
    editing,
    input,
    start: () => setEditingId(id),
    stop: () => setEditingId(null),
    remove: () => removeNode(id),
  }
}

export function NoteNode({ id, data, selected, positionAbsoluteY }: NodeProps<StoryFlowNode>) {
  const node = data.node as NoteMapNode
  const updateMapNode = useStory((s) => s.updateMapNode)
  const { editing, input, start, stop, remove } = useEditing(id)
  const side = useToolbarSide(selected, positionAbsoluteY)

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
      <NodeToolbar isVisible={selected && !editing} position={side} className="map-toolbar">
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

export function TextNode({ id, data, selected, positionAbsoluteY }: NodeProps<StoryFlowNode>) {
  const node = data.node as TextMapNode
  const updateMapNode = useStory((s) => s.updateMapNode)
  const { editing, input, start, stop, remove } = useEditing(id)
  const side = useToolbarSide(selected, positionAbsoluteY)

  return (
    <div className={`map-text size-${node.size}${editing ? ' editing' : ''}${selected ? ' selected' : ''}`} onDoubleClick={start}>
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={80}
        minHeight={30}
        lineClassName="map-resize-line"
        handleClassName="map-resize-handle"
        onResizeEnd={(_, p) => updateMapNode(id, { x: p.x, y: p.y, width: p.width })}
      />
      <NodeToolbar isVisible={selected && !editing} position={side} className="map-toolbar">
        {SIZES.map((s) => (
          <button
            key={s.size}
            className={`map-tool size-btn${s.size === node.size ? ' active' : ''}`}
            onClick={() => updateMapNode(id, { size: s.size })}
            aria-label={`Text size ${s.label}`}
          >
            {s.label}
          </button>
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
        <MentionTextarea
          ref={input}
          className="map-text-input nodrag nopan nowheel"
          value={node.text}
          placeholder="Type here…"
          aria-label="Text"
          onChange={(text) => updateMapNode(id, { text })}
          onBlur={stop}
        />
      ) : (
        <div className="map-text-body">
          {node.text ? <MentionText text={node.text} /> : <span className="map-placeholder">Double-click to type</span>}
        </div>
      )}
    </div>
  )
}
