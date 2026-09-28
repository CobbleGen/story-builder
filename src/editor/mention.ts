import Mention from '@tiptap/extension-mention'
import { ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import { useStory } from '../store/storyStore'
import { displayName, matchesName } from '../lib/mentions'
import { nextArcColor } from '../lib/colors'
import { MENTION_NODE } from '../lib/richText'
import { MentionList, MentionView, type MentionItem, type MentionListHandle } from './MentionViews'

type Item = MentionItem

const NEW_NAME_RE = /^[\p{L}\p{N}_'’-]+$/u

/** `@` mentions of characters, with suggestions and "new character". */
export const CharacterMention = Mention.extend({
  name: MENTION_NODE,
  addNodeView() {
    return ReactNodeViewRenderer(MentionView, { as: 'span' })
  },
}).configure({
  renderText: ({ node }) => {
    const c = useStory.getState().characters.find((ch) => ch.id === node.attrs.id)
    return c ? displayName(c) : String(node.attrs.label ?? '')
  },
  renderHTML: ({ node }) => {
    const c = useStory.getState().characters.find((ch) => ch.id === node.attrs.id)
    return ['span', { class: 'mention', 'data-type': 'mention', 'data-id': node.attrs.id }, c ? displayName(c) : String(node.attrs.label ?? '')]
  },
  suggestion: {
    char: '@',
    items: ({ query }): Item[] => {
      const characters = useStory.getState().characters
      const found = characters.filter((c) => matchesName(c, query))
      const exact = found.find((c) => displayName(c).toLowerCase() === query.toLowerCase())
      const items: Item[] = (exact ? [exact, ...found.filter((c) => c !== exact)] : found)
        .slice(0, 6)
        .map((c) => ({ kind: 'character', id: c.id, label: displayName(c) }))
      if (query && !exact && NEW_NAME_RE.test(query)) items.push({ kind: 'create', label: query })
      return items
    },
    command: ({ editor, range, props }) => {
      const item = props as Item
      let id: string
      if (item.kind === 'create') {
        const store = useStory.getState()
        id = store.addCharacter({ name: item.label, color: nextArcColor(store.characters.map((c) => c.color)) })
      } else {
        id = item.id
      }
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
