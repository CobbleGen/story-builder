import { Extension } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * Marks the paragraph (or other top-level block) being written in with the
 * class `is-current`, so focus mode can fade the others.
 */
export const CurrentBlock = Extension.create({
  name: 'currentBlock',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('currentBlock'),
        props: {
          decorations(state) {
            const { selection } = state
            // A picture picked on its own is a top-level block itself.
            const start =
              selection instanceof NodeSelection && selection.$from.depth === 0
                ? selection.from
                : selection.$head.depth >= 1
                  ? selection.$head.before(1)
                  : null
            const node = start === null ? null : state.doc.nodeAt(start)
            if (start === null || !node) return null
            return DecorationSet.create(state.doc, [Decoration.node(start, start + node.nodeSize, { class: 'is-current' })])
          },
        },
      }),
    ]
  },
})
