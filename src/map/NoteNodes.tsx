import { useEffect, useRef, useState } from 'react'
import { NodeResizer, NodeToolbar, type NodeProps } from '@xyflow/react'
import { Minus, PenLine, Plus, Trash2 } from 'lucide-react'
import type { MapNode, NoteColor } from '../types'
import { useStory } from '../store/storyStore'
import { NOTE_COLORS } from '../store/storyOps'
import { MentionText } from '../components/MentionText'
import { MentionTextarea } from '../components/MentionTextarea'
import { Handles } from './EntityNodes'
import { ListButtons, ListEditor, TextList } from './TextList'
import { NOTE_COLOR_VALUES, focusSoon, useMap, useToolbarPlacement, type StoryFlowNode } from './mapShared'
import { MAX_TEXT_SIZE, MIN_TEXT_SIZE, NOTE_TEXT_SIZE, cleanTextSize, stepTextSize, textLook } from '../lib/textSize'

type NoteMapNode = Extract<MapNode, { kind: 'note' }>
type TextMapNode = Extract<MapNode, { kind: 'text' }>

/** Text size: smaller and larger buttons, with the size between them to type over. */
function TextSizeControl({ size, onChange }: { size: number; onChange: (size: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    const typed = draft === null ? undefined : cleanTextSize(Number.parseFloat(draft.replace(',', '.')))
    if (typed !== undefined && typed !== size) onChange(typed)
    setDraft(null)
  }
  return (
    <span className="map-size" role="group" aria-label="Text size">
      <button
        className="map-tool icon-only"
        onClick={() => onChange(stepTextSize(size, -1))}
        disabled={size <= MIN_TEXT_SIZE}
        aria-label="Smaller text"
        title="Smaller text"
      >
        <Minus size={14} />
      </button>
      <input
        className="map-size-input"
        value={draft ?? String(size)}
        inputMode="decimal"
        aria-label="Text size"
        title={`Text size (${MIN_TEXT_SIZE}–${MAX_TEXT_SIZE})`}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            setDraft(null)
            onChange(stepTextSize(size, e.key === 'ArrowUp' ? 1 : -1))
          }
        }}
      />
      <button
        className="map-tool icon-only"
        onClick={() => onChange(stepTextSize(size, 1))}
        disabled={size >= MAX_TEXT_SIZE}
        aria-label="Larger text"
        title="Larger text"
      >
        <Plus size={14} />
      </button>
    </span>
  )
}


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
      className={`map-note note-${node.color}${editing ? ' editing' : ''}`}
      style={{ background: NOTE_COLOR_VALUES[node.color], fontSize: node.size }}
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
        <TextSizeControl size={node.size ?? NOTE_TEXT_SIZE} onChange={(size) => updateMapNode(id, { size })} />
        <span className="map-tool-sep" />
        <ListButtons node={node} />
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
        <div className="map-note-scroll nodrag nopan nowheel">
          {node.list ? (
            <ListEditor node={node} onDone={stop} />
          ) : (
            <MentionTextarea
              ref={input}
              className="map-note-input"
              value={node.text}
              placeholder="Write a note… Type @ to mention a character."
              aria-label="Note"
              onChange={(text) => updateMapNode(id, { text })}
              onBlur={stop}
            />
          )}
        </div>
      ) : (
        <div className="map-note-text map-scroll">
          {node.text && node.list ? (
            <TextList node={node} />
          ) : node.text ? (
            <MentionText text={node.text} />
          ) : (
            <span className="map-placeholder">Double-click to write</span>
          )}
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

  return (
    <div
      className={`map-text look-${textLook(node.size)}${node.bg ? ` has-bg bg-${node.bg}` : ''}${editing ? ' editing' : ''}${selected ? ' selected' : ''}`}
      style={{ fontSize: node.size, background: node.bg ? NOTE_COLOR_VALUES[node.bg] : undefined }}
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
        <TextSizeControl size={node.size} onChange={(size) => updateMapNode(id, { size })} />
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
        <ListButtons node={node} />
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
