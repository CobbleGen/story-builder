import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import { history, redo, undo } from '@tiptap/pm/history'
import { manuscriptExtensions } from './extensions'
import { countWords, wordChange } from './wordChanges'
import { tally, type WordChange, type WordTally } from '../lib/progress'

const schema = getSchema(manuscriptExtensions(''))
const p = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : [])
const stateOf = (...paragraphs: string[]) =>
  EditorState.create({ schema, doc: schema.node('doc', null, paragraphs.map(p)), plugins: [history()] })
/** Where `text` starts in the first paragraph that has it (inside the paragraph, so +1). */
const at = (state: EditorState | Transaction, text: string) => {
  let found = -1
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text!.includes(text)) found = pos + node.text!.indexOf(text)
  })
  if (found < 0) throw new Error(`no "${text}"`)
  return found
}

/** Runs transactions through the state, adding up what they did to the day's words. */
function writer(start: EditorState) {
  let state = start
  let day: WordTally = { added: 0, cut: 0 }
  const changes: (WordChange | null)[] = []
  const apply = (tr: Transaction) => {
    const change = wordChange(tr)
    changes.push(change)
    if (change) day = tally(day, change)
    state = state.apply(tr)
  }
  return {
    get state() {
      return state
    },
    get day() {
      return day
    },
    changes,
    apply,
    /** Types text one character at a time, as a writer does (at the end, unless told where). */
    type(text: string, pos = state.doc.content.size - 1) {
      for (const ch of text) {
        apply(state.tr.insertText(ch, pos))
        pos += 1
      }
    },
    run(command: (s: EditorState, dispatch: (tr: Transaction) => void) => boolean) {
      command(state, apply)
    },
  }
}

describe('words added and cut in the manuscript', () => {
  it('counts a word when it starts, not every letter, and edits within a word as nothing', () => {
    const w = writer(stateOf('The sea'))
    w.type(' was calm')
    expect(w.day).toEqual({ added: 2, cut: 0 })
    // A letter more, a typo fixed: the same words
    w.type('l', at(w.state, 'calm') + 3)
    w.apply(w.state.tr.insertText('cool', at(w.state, 'call'), at(w.state, 'call') + 5))
    expect(w.day).toEqual({ added: 2, cut: 0 })
    expect(countWords(w.state.doc)).toBe(4)
  })

  it('counts words deleted as cut, and never takes them off what was written', () => {
    const w = writer(stateOf('One two three four'))
    w.type(' five six')
    const from = at(w.state, ' two')
    // Backspacing "two" a letter at a time
    for (let i = 0; i < 4; i++) w.apply(w.state.tr.delete(from + 3 - i, from + 4 - i))
    expect(w.state.doc.textContent).toBe('One three four five six')
    expect(w.day).toEqual({ added: 2, cut: 1 })
  })

  it('counts words written over a selection as cut and added', () => {
    const w = writer(stateOf('It was a dark and stormy night.'))
    const from = at(w.state, 'a dark and stormy')
    w.apply(w.state.tr.insertText('b', from, from + 'a dark and stormy'.length))
    w.type('right', from + 1)
    expect(w.state.doc.textContent).toBe('It was bright night.')
    expect(w.day).toEqual({ added: 1, cut: 4 })
  })

  it('counts a split word, or two joined, as a word more or less', () => {
    const w = writer(stateOf('lighthouse keeper'))
    w.apply(w.state.tr.insertText(' ', at(w.state, 'house')))
    expect(w.day).toEqual({ added: 1, cut: 0 })
    // Enter in the middle of a word makes two paragraphs, and two words
    const w2 = writer(stateOf('nightfall'))
    w2.apply(w2.state.tr.split(at(w2.state, 'fall')))
    expect([w2.state.doc.childCount, w2.day]).toEqual([2, { added: 1, cut: 0 }])
  })

  it('takes back what undo undoes, and counts it again on redo', () => {
    const w = writer(stateOf('Start.'))
    w.type(' More words here')
    expect(w.day).toEqual({ added: 3, cut: 0 })
    w.run(undo)
    expect(w.state.doc.textContent).toBe('Start.')
    expect(w.day).toEqual({ added: 0, cut: 0 })
    w.run(redo)
    expect(w.day).toEqual({ added: 3, cut: 0 })
    // Cutting, then undoing the cut
    const from = at(w.state, ' More')
    w.apply(w.state.tr.delete(from, from + ' More words'.length))
    expect(w.day).toEqual({ added: 3, cut: 2 })
    w.run(undo)
    expect(w.day).toEqual({ added: 3, cut: 0 })
  })

  it('counts text moved by cut and paste, or by dragging, as neither written nor cut', () => {
    const w = writer(stateOf('First part. Second part.', 'End.'))
    const from = at(w.state, 'Second part.')
    w.apply(w.state.tr.delete(from, from + 'Second part.'.length).setMeta('uiEvent', 'cut'))
    expect(w.day).toEqual({ added: 0, cut: 2 })
    w.apply(w.state.tr.insertText('Second part. ', at(w.state, 'End.')).setMeta('uiEvent', 'paste'))
    expect(w.state.doc.child(1).textContent).toBe('Second part. End.')
    expect(w.day).toEqual({ added: 0, cut: 0 })
    // Pasting it again is new words
    w.apply(w.state.tr.insertText(' Second part.', w.state.doc.content.size - 1).setMeta('uiEvent', 'paste'))
    expect(w.day).toEqual({ added: 2, cut: 0 })
    // Dragged elsewhere in one go, and that undone
    const drag = writer(stateOf('Alpha beta gamma.'))
    drag.type(' Delta')
    const beta = at(drag.state, 'beta ')
    const tr = drag.state.tr.delete(beta, beta + 'beta '.length)
    tr.insertText(' beta', at(tr, 'gamma') + 'gamma'.length)
    drag.apply(tr.setMeta('uiEvent', 'drop'))
    expect([drag.state.doc.textContent, drag.day]).toEqual(['Alpha gamma beta. Delta', { added: 1, cut: 0 }])
    drag.run(undo)
    expect([drag.state.doc.textContent, drag.day]).toEqual(['Alpha beta gamma. Delta', { added: 1, cut: 0 }])
  })

  it('counts moved text as cut again when its paste is undone, and back when redone', () => {
    const w = writer(stateOf('Keep this. Move these four words.', 'Tail.'))
    w.type(' New')
    const from = at(w.state, 'Move these four words.')
    w.apply(w.state.tr.delete(from, from + 'Move these four words.'.length).setMeta('uiEvent', 'cut'))
    w.apply(w.state.tr.insertText('Move these four words. ', at(w.state, 'Tail.')).setMeta('uiEvent', 'paste'))
    expect(w.day).toEqual({ added: 1, cut: 0 })
    w.run(undo)
    expect([w.state.doc.child(1).textContent, w.day]).toEqual(['Tail. New', { added: 1, cut: 4 }])
    w.run(redo)
    expect([w.state.doc.child(1).textContent, w.day]).toEqual(['Move these four words. Tail. New', { added: 1, cut: 0 }])
    // The cut undone instead: the words are back, and a paste of them now is new
    const v = writer(stateOf('One two three.'))
    const two = at(v.state, 'two three.')
    v.apply(v.state.tr.delete(two, two + 'two three.'.length).setMeta('uiEvent', 'cut'))
    v.run(undo)
    expect(v.day).toEqual({ added: 0, cut: 0 })
    v.apply(v.state.tr.insertText(' two three.', v.state.doc.content.size - 1).setMeta('uiEvent', 'paste'))
    expect(v.day).toEqual({ added: 2, cut: 0 })
  })

  it('leaves out changes the writer didn’t make', () => {
    const w = writer(stateOf('Text'))
    w.apply(w.state.tr.insertText(' more words', 5).setMeta('addToHistory', false))
    expect(w.changes).toEqual([null])
    // Nor a selection with no change
    w.apply(w.state.tr.setSelection(TextSelection.create(w.state.doc, 2)))
    expect(w.changes).toEqual([null, null])
  })

  it('adds up to the change in the word count', () => {
    const w = writer(stateOf('A quiet harbour at dawn.', 'Gulls cried over the water.'))
    const start = countWords(w.state.doc)
    w.type(' The boats came in')
    w.apply(w.state.tr.delete(at(w.state, 'quiet '), at(w.state, 'quiet ') + 6))
    w.apply(w.state.tr.insertText('wheeled and', at(w.state, 'cried'), at(w.state, 'cried') + 5))
    w.apply(w.state.tr.split(at(w.state, 'over')))
    w.run(undo)
    w.type(' slowly', at(w.state, 'dawn') + 4)
    const net = countWords(w.state.doc) - start
    expect(w.day.added - w.day.cut).toBe(net)
  })
})
