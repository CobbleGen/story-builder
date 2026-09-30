import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, X } from 'lucide-react'
import type { CharacterAttribute } from '../types'
import { useStory } from '../store/storyStore'
import { MentionTextarea } from './MentionTextarea'

interface Props {
  /** The character or element the attributes belong to. */
  ownerId: string
  attributes: CharacterAttribute[]
  /** Labels offered as one-click chips (those already used are left out). */
  suggestions: string[]
  /** Shown while there are none yet. */
  emptyText: string
}

/** A character's or element's attributes: label and value rows, in an order the writer can drag. */
export function AttributesEditor({ ownerId, attributes, suggestions, emptyText }: Props) {
  const addAttribute = useStory((s) => s.addAttribute)
  const moveAttribute = useStory((s) => s.moveAttribute)
  const [focus, setFocus] = useState<{ id: string; field: 'label' | 'value' } | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const used = new Set(attributes.map((a) => a.label.trim().toLowerCase()))
  const offered = suggestions.filter((label) => !used.has(label.toLowerCase()))
  const ids = attributes.map((a) => a.id)

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    moveAttribute(ownerId, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
  }

  return (
    <section className="char-section">
      <h2 className="section-title">Attributes</h2>
      {attributes.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="attr-list">
              {attributes.map((attr) => (
                <AttributeRow
                  key={attr.id}
                  ownerId={ownerId}
                  attribute={attr}
                  focusField={focus?.id === attr.id ? focus.field : null}
                  onFocused={() => setFocus(null)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="section-empty">{emptyText}</p>
      )}
      <div className="attr-actions">
        <button className="btn ghost" onClick={() => setFocus({ id: addAttribute(ownerId), field: 'label' })}>
          <Plus size={16} /> Add attribute
        </button>
        {offered.map((label) => (
          <button
            key={label}
            className="suggestion-chip"
            onClick={() => setFocus({ id: addAttribute(ownerId, { label }), field: 'value' })}
          >
            <Plus size={12} />
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}

interface AttributeRowProps {
  ownerId: string
  attribute: CharacterAttribute
  focusField: 'label' | 'value' | null
  onFocused: () => void
}

function AttributeRow({ ownerId, attribute, focusField, onFocused }: AttributeRowProps) {
  const updateAttribute = useStory((s) => s.updateAttribute)
  const deleteAttribute = useStory((s) => s.deleteAttribute)
  const labelRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef<HTMLTextAreaElement>(null)
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: attribute.id })

  useEffect(() => {
    if (!focusField) return
    ;(focusField === 'label' ? labelRef.current : valueRef.current)?.focus()
    onFocused()
  }, [focusField, onFocused])

  return (
    <div
      ref={setNodeRef}
      className={`attr-row${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        className="grip-btn"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${attribute.label || 'attribute'}`}
      >
        <GripVertical size={16} />
      </button>
      <input
        ref={labelRef}
        className="attr-label"
        value={attribute.label}
        placeholder="Attribute"
        aria-label="Attribute name"
        onChange={(e) => updateAttribute(ownerId, attribute.id, { label: e.target.value })}
      />
      <MentionTextarea
        ref={valueRef}
        className="attr-value"
        value={attribute.value}
        placeholder="Value"
        aria-label={`${attribute.label || 'Attribute'} value`}
        onChange={(value) => updateAttribute(ownerId, attribute.id, { value })}
      />
      <button
        className="icon-btn danger attr-remove"
        onClick={() => deleteAttribute(ownerId, attribute.id)}
        aria-label={`Remove ${attribute.label || 'attribute'}`}
        title="Remove attribute"
      >
        <X size={16} />
      </button>
    </div>
  )
}
