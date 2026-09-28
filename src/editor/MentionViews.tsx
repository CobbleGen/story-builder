import { forwardRef, useImperativeHandle, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { SuggestionProps } from '@tiptap/suggestion'
import { UserPlus } from 'lucide-react'
import { useStory } from '../store/storyStore'
import { displayName } from '../lib/mentions'
import { CharacterAvatar } from '../components/CharacterAvatar'

export type MentionItem = { kind: 'character'; id: string; label: string } | { kind: 'create'; label: string }

export interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/** A mention in the manuscript: the character's current name, in their colour. */
export function MentionView({ node }: NodeViewProps) {
  const character = useStory((s) => s.characters.find((c) => c.id === node.attrs.id))
  return (
    <NodeViewWrapper
      as="span"
      className={`mention${character ? '' : ' unknown'}`}
      style={character ? ({ '--char': character.color } as React.CSSProperties) : undefined}
    >
      {character ? displayName(character) : (node.attrs.label ?? 'unknown character')}
    </NodeViewWrapper>
  )
}

export const MentionList = forwardRef<MentionListHandle, SuggestionProps<MentionItem, MentionItem>>(function MentionList({ items, command }, ref) {
  const characters = useStory((s) => s.characters)
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
        const character = item.kind === 'character' ? characters.find((c) => c.id === item.id) : undefined
        return (
          <div
            key={item.kind === 'create' ? 'create' : item.id}
            role="option"
            aria-selected={i === index}
            className={`mention-option${i === index ? ' active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => command(item)}
          >
            {character ? (
              <CharacterAvatar character={character} size="sm" />
            ) : (
              <span className="avatar avatar-sm avatar-new">
                <UserPlus size={12} />
              </span>
            )}
            <span className="mention-option-name">
              {item.kind === 'create' ? `New character “${item.label}”` : item.label}
            </span>
          </div>
        )
      })}
    </div>
  )
})
