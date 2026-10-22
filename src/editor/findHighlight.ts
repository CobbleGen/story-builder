import { Extension, type Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { OBJECT, findIn } from '../lib/replace'

// Find in the open chapter: where the query is, highlighted, the current one
// stronger. The matches follow the text as it changes.

export interface Match {
  from: number
  to: number
}

interface FindState {
  re: RegExp | null
  current: number
  matches: Match[]
  deco: DecorationSet
}

const key = new PluginKey<FindState>('findHighlight')

/** Where the pattern is in the text, paragraph by paragraph (no match runs through a mention or line break). */
export function docMatches(doc: PmNode, re: RegExp): Match[] {
  const out: Match[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    node.forEach((child) => {
      text += child.isText ? (child.text ?? '') : OBJECT.repeat(child.nodeSize)
    })
    for (const [start, end] of findIn(text, re)) out.push({ from: pos + 1 + start, to: pos + 1 + end })
    return false
  })
  return out
}

function stateFor(doc: PmNode, re: RegExp | null, current: number, found?: Match[]): FindState {
  if (!re) return { re: null, current: -1, matches: [], deco: DecorationSet.empty }
  const matches = found ?? docMatches(doc, re)
  const at = matches.length ? Math.max(0, Math.min(current, matches.length - 1)) : -1
  const deco = DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === at ? 'find-match current' : 'find-match' })),
  )
  return { re, current: at, matches, deco }
}

export const FindHighlight = Extension.create({
  name: 'findHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key,
        state: {
          init: () => ({ re: null, current: -1, matches: [], deco: DecorationSet.empty }),
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(key) as { re: RegExp | null; current: number } | undefined
            if (meta) return stateFor(state.doc, meta.re, meta.current)
            if (!tr.docChanged || !prev.re) return prev
            // After an edit, the current match is the first that ends after where it was.
            const matches = docMatches(state.doc, prev.re)
            const was = prev.matches[prev.current]
            const i = was ? matches.findIndex((m) => m.to > tr.mapping.map(was.from)) : 0
            return stateFor(state.doc, prev.re, i < 0 ? matches.length - 1 : i, matches)
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.deco,
        },
      }),
    ]
  },
})

/** The matches in the open chapter now, and which is current. */
export const findState = (editor: Editor) => key.getState(editor.state) ?? { re: null, current: -1, matches: [], deco: DecorationSet.empty }

/** Shows the matches of `re` (none for null), with `current` the one picked out. */
export function setFind(editor: Editor, re: RegExp | null, current: number) {
  if (editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(key, { re, current }).setMeta('addToHistory', false))
}
