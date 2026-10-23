import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { RichNode } from '../types'
import { docText, findAnchor, type TextAnchor } from '../comments/anchor'

// The passages of the open chapter that have comments on them, marked in the
// text. Each is found by its words when the comments come in (see
// comments/anchor), then follows the text as it's edited. Clicking one opens
// its comments.

export interface MarkedPassage extends TextAnchor {
  id: string
}

interface MarksState {
  deco: DecorationSet
  active: string | null
}

const key = new PluginKey<MarksState>('commentHighlight')

type NameOf = (id: string, label: unknown) => string

export const CommentHighlight = Extension.create<{ onOpen: (id: string) => void }>({
  name: 'commentHighlight',
  addOptions: () => ({ onOpen: () => {} }),
  addProseMirrorPlugins() {
    const { onOpen } = this.options
    return [
      new Plugin<MarksState>({
        key,
        state: {
          init: () => ({ deco: DecorationSet.empty, active: null }),
          apply(tr, prev) {
            const next = tr.getMeta(key) as MarksState | undefined
            if (next) return next
            return tr.docChanged ? { ...prev, deco: prev.deco.map(tr.mapping, tr.doc) } : prev
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.deco,
          handleDOMEvents: {
            // (A click, not the end of selecting some words.)
            click(view, event) {
              const id = (event.target as Element | null)?.closest?.('[data-comment]')?.getAttribute('data-comment')
              if (id && view.state.selection.empty) onOpen(id)
              return false
            },
          },
        },
      }),
    ]
  },
})

/** Marks these passages in the text (found by their words), `active` most strongly. */
export function setCommentMarks(editor: Editor, passages: MarkedPassage[], active: string | null, nameOf: NameOf) {
  if (editor.isDestroyed) return
  const was = key.getState(editor.state)
  // (Nothing to mark, as before: no step for the editor to take.)
  if (!passages.length && (!was || was.deco === DecorationSet.empty)) return
  const { doc } = editor.state
  // Passages already marked stay where the text has carried them; new ones are found by their words.
  const marked = new Map<string, { from: number; to: number }>()
  for (const d of was?.deco.find() ?? []) marked.set((d.spec as { id: string }).id, { from: d.from, to: d.to })
  let text: ReturnType<typeof docText> | null = null
  const decorations: Decoration[] = []
  for (const p of passages) {
    let found = marked.get(p.id) ?? null
    if (!found) {
      text ??= docText(doc.toJSON() as RichNode, nameOf)
      found = findAnchor(text, p)
    }
    if (!found || found.to <= found.from) continue
    decorations.push(
      Decoration.inline(found.from, found.to, { class: p.id === active ? 'comment-mark active' : 'comment-mark', 'data-comment': p.id }, { id: p.id, inclusiveEnd: false }),
    )
  }
  const state: MarksState = { deco: DecorationSet.create(doc, decorations), active }
  editor.view.dispatch(editor.state.tr.setMeta(key, state).setMeta('addToHistory', false).setMeta('preventUpdate', true))
}

/** Where a passage is marked now (it follows the text as it changes), if it is. */
export function markedAt(editor: Editor, id: string): { from: number; to: number } | null {
  const deco = key.getState(editor.state)?.deco.find(undefined, undefined, (spec) => (spec as { id?: string }).id === id)[0]
  return deco ? { from: deco.from, to: deco.to } : null
}
