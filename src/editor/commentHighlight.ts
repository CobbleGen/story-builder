import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { RichNode } from '../types'
import { docText, findAnchor, type TextAnchor } from '../comments/anchor'

// The passages of the open chapter that have comments on them, marked in the
// text. Each is found by its words when the comments come in (see
// comments/anchor), then follows the text as it's edited. Clicking one opens
// its comments. A suggested change shows as the words struck through, with
// the words suggested in their place just after.

export interface MarkedPassage extends TextAnchor {
  id: string
  resolved?: boolean
  /** The words suggested in place of the passage ('' to cut it), while it's open. */
  suggest?: string
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
  for (const d of was?.deco.find() ?? []) {
    const spec = d.spec as { id: string; passage?: boolean }
    if (spec.passage) marked.set(spec.id, { from: d.from, to: d.to })
  }
  let text: ReturnType<typeof docText> | null = null
  const decorations: Decoration[] = []
  for (const p of passages) {
    let found = marked.get(p.id) ?? null
    if (!found) {
      text ??= docText(doc.toJSON() as RichNode, nameOf)
      found = findAnchor(text, p)
    }
    if (!found || found.to <= found.from) continue
    const classes = ['comment-mark']
    if (p.resolved) classes.push('resolved')
    if (p.suggest !== undefined) classes.push('suggested')
    if (p.id === active) classes.push('active')
    const look = classes.join(' ')
    decorations.push(Decoration.inline(found.from, found.to, { class: look, 'data-comment': p.id }, { id: p.id, passage: true, look, inclusiveEnd: false }))
    if (p.suggest) {
      const words = p.suggest
      decorations.push(
        Decoration.widget(
          found.to,
          () => {
            const span = document.createElement('span')
            span.className = `suggest-insert${p.id === active ? ' active' : ''}`
            span.dataset.comment = p.id
            span.textContent = words
            span.title = 'Suggested in its place'
            return span
          },
          { id: p.id, side: 1, key: `${p.id}:${p.id === active}:${words}`, look: `insert:${p.id === active}:${words}`, ignoreSelection: true },
        ),
      )
    }
  }
  // (The same marks, where they are already, as when the writer's own typing is saved: nothing for the editor to do.)
  if (was && sameMarks(was.deco.find(), decorations)) return
  const state: MarksState = { deco: DecorationSet.create(doc, decorations), active }
  editor.view.dispatch(editor.state.tr.setMeta(key, state).setMeta('addToHistory', false).setMeta('preventUpdate', true))
}

const markKey = (d: Decoration) => `${d.from}:${d.to}:${(d.spec as { id?: string }).id}:${(d.spec as { look?: string }).look}`

function sameMarks(a: Decoration[], b: Decoration[]): boolean {
  if (a.length !== b.length) return false
  const keys = new Set(a.map(markKey))
  return b.every((d) => keys.has(markKey(d)))
}

/** Where a passage is marked now (it follows the text as it changes), if it is. */
export function markedAt(editor: Editor, id: string): { from: number; to: number } | null {
  const deco = key.getState(editor.state)?.deco.find(undefined, undefined, (spec) => (spec as { id?: string; passage?: boolean }).id === id && !!spec.passage)[0]
  return deco ? { from: deco.from, to: deco.to } : null
}
