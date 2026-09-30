import Mention from '@tiptap/extension-mention'
import { ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import { useStory } from '../store/storyStore'
import { mentionables } from '../store/storyOps'
import { displayName, matchesName } from '../lib/mentions'
import { createMentioned } from '../lib/newMentioned'
import { MENTION_NODE } from '../lib/richText'
import { MentionList, MentionView, type MentionItem, type MentionListHandle } from './MentionViews'

type Item = MentionItem

const NEW_NAME_RE = /^[\p{L}\p{N}_'’-]+$/u

/** The character or element a mention points at, if it still exists. */
function named(id: unknown) {
  const s = useStory.getState()
  return s.characters.find((c) => c.id === id) ?? s.elements.find((e) => e.id === id)
}

/** `@` mentions of characters, places and things, with suggestions and "new character" or "new place". */
export const CharacterMention = Mention.extend({
  name: MENTION_NODE,
  addNodeView() {
    return ReactNodeViewRenderer(MentionView, { as: 'span' })
  },
}).configure({
  renderText: ({ node }) => {
    const c = named(node.attrs.id)
    return c ? displayName(c) : String(node.attrs.label ?? '')
  },
  renderHTML: ({ node }) => {
    const c = named(node.attrs.id)
    return ['span', { class: 'mention', 'data-type': 'mention', 'data-id': node.attrs.id }, c ? displayName(c) : String(node.attrs.label ?? '')]
  },
  suggestion: {
    char: '@',
    items: ({ query }): Item[] => {
      const found = mentionables(useStory.getState()).filter((c) => matchesName(c, query))
      const exact = found.find((c) => displayName(c).toLowerCase() === query.toLowerCase())
      const items: Item[] = (exact ? [exact, ...found.filter((c) => c !== exact)] : found)
        .slice(0, 6)
        .map((c) => ({ kind: 'item', id: c.id, label: displayName(c) }))
      if (query && !exact && NEW_NAME_RE.test(query)) {
        items.push({ kind: 'create', what: 'character', label: query }, { kind: 'create', what: 'place', label: query })
      }
      return items
    },
    command: ({ editor, range, props }) => {
      const item = props as Item
      const id = item.kind === 'create' ? createMentioned(item.what, item.label) : item.id
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: MENTION_NODE, attrs: { id, label: item.label } },
          { type: 'text', text: ' ' },
        ])
        .run()
    },
    render: () => {
      let renderer: ReactRenderer<MentionListHandle, SuggestionProps<Item, Item>> | null = null
      let unmount: (() => void) | null = null
      return {
        onStart: (props) => {
          renderer = new ReactRenderer(MentionList, { props, editor: props.editor, className: 'mention-float' })
          unmount = props.mount(renderer.element as HTMLElement)
        },
        onUpdate: (props) => renderer?.updateProps(props),
        onKeyDown: ({ event }: SuggestionKeyDownProps) => {
          if (event.key === 'Escape') return false
          return renderer?.ref?.onKeyDown(event) ?? false
        },
        onExit: () => {
          unmount?.()
          renderer?.destroy()
          renderer = null
        },
      }
    },
  },
})
