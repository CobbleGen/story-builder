import { forwardRef, useImperativeHandle, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { SuggestionProps } from '@tiptap/suggestion'
import { MapPinPlus, UserPlus } from 'lucide-react'
import { useMentionLookup } from '../store/storyStore'
import { displayName } from '../lib/mentions'
import type { NewMentioned } from '../lib/newMentioned'
import { MentionBadge } from '../components/ElementIcon'

export type MentionItem = { kind: 'item'; id: string; label: string } | { kind: 'create'; what: NewMentioned; label: string }

export interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/** A mention in the manuscript: the current name of who or what it names, in its colour. */
export function MentionView({ node }: NodeViewProps) {
  const named = useMentionLookup().get(String(node.attrs.id))
  return (
    <NodeViewWrapper
      as="span"
      className={`mention${named ? '' : ' unknown'}`}
      style={named ? ({ '--char': named.color } as React.CSSProperties) : undefined}
    >
      {named ? displayName(named) : (node.attrs.label ?? 'unknown')}
    </NodeViewWrapper>
  )
}

export const MentionList = forwardRef<MentionListHandle, SuggestionProps<MentionItem, MentionItem>>(function MentionList({ items, command }, ref) {
  const lookup = useMentionLookup()
  const [active, setActive] = useState(0)
  const index = Math.min(active, Math.max(0, items.length - 1))

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!items.length) return false
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : -1
        setActive((index + step + items.length) % items.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        command(items[index])
        return true
      }
      return false
    },
  }))

  if (!items.length) return null
  return (
    <div className="mention-popup floating" role="listbox">
      {items.map((item, i) => {
        const named = item.kind === 'item' ? lookup.get(item.id) : undefined
        return (
          <div
            key={item.kind === 'create' ? `create-${item.what}` : item.id}
            role="option"
            aria-selected={i === index}
            className={`mention-option${i === index ? ' active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => command(item)}
          >
            {named ? (
              <MentionBadge item={named} size="sm" />
            ) : (
              <span className="avatar avatar-sm avatar-new">
                {item.kind === 'create' && item.what === 'place' ? <MapPinPlus size={12} /> : <UserPlus size={12} />}
              </span>
            )}
            <span className="mention-option-name">
              {item.kind === 'create' ? `New ${item.what} “${item.label}”` : item.label}
            </span>
          </div>
        )
      })}
    </div>
  )
})
