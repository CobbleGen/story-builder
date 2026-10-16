import type { Node as PmNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import type { WordChange } from '../lib/progress'
import { MENTION_NODE } from '../lib/richText'

// The words a change to the manuscript added and cut, so a day's writing can
// be counted apart from its cutting. Words are counted as they come into the
// text and leave it: typing a word adds it, deleting it cuts it, and editing
// one (a letter more, a typo fixed) is neither.

/** Text for counting: a mention is one word; anything else that isn't text, a space. */
const leafText = (leaf: PmNode) => (leaf.type.name === MENTION_NODE ? 'x' : ' ')
const words = (text: string) => text.split(/\s+/).filter(Boolean).length
/** Text with more than one word in it (or a word and a space between others). */
const spansWords = (text: string) => /\S\s+\S/.test(text)
const squeeze = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Words in the whole text. */
export function countWords(doc: PmNode): number {
  return words(doc.textBetween(0, doc.content.size, ' ', leafText))
}

/** Where the word at `pos` starts (`pos` itself between words). */
function wordStart(doc: PmNode, pos: number): number {
  const $pos = doc.resolve(pos)
  if (!$pos.parent.isTextblock) return pos
  const before = $pos.parent.textBetween(0, $pos.parentOffset, ' ', leafText)
  return pos - (/\S*$/.exec(before)?.[0].length ?? 0)
}

/** Where the word at `pos` ends. */
function wordEnd(doc: PmNode, pos: number): number {
  const $pos = doc.resolve(pos)
  if (!$pos.parent.isTextblock) return pos
  const after = $pos.parent.textBetween($pos.parentOffset, $pos.parent.content.size, ' ', leafText)
  return pos + (/^\S*/.exec(after)?.[0].length ?? 0)
}

const wordsAround = (doc: PmNode, from: number, to: number) => words(doc.textBetween(wordStart(doc, from), wordEnd(doc, to), ' ', leafText))

/** Words a transaction's steps brought in and took out, with the text taken out and put in. */
function measure(tr: Transaction) {
  let gained = 0
  let lost = 0
  const taken: string[] = []
  const given: string[] = []
  tr.steps.forEach((step, i) => {
    const before = tr.docs[i]
    const after = tr.docs[i + 1] ?? tr.doc
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      const was = before.textBetween(oldStart, oldEnd, ' ', leafText)
      const is = after.textBetween(newStart, newEnd, ' ', leafText)
      taken.push(was)
      given.push(is)
      // The words around the change, before and after: typing into a word leaves it one word.
      const wordsWere = wordsAround(before, oldStart, oldEnd)
      const wordsAre = wordsAround(after, newStart, newEnd)
      if (oldStart < oldEnd && newStart < newEnd && (spansWords(was) || spansWords(is))) {
        // Words written over others (typed over a selection, pasted over it): those cut, these added.
        lost += wordsWere
        gained += wordsAre
      } else if (wordsAre > wordsWere) gained += wordsAre - wordsWere
      else lost += wordsWere - wordsAre
    })
  })
  return { gained, lost, taken: squeeze(taken.join(' ')), given: squeeze(given.join(' ')) }
}

/** The text last cut (Ctrl+X), in any chapter: pasted somewhere, it's moved, not written. */
let lastCut: string | null = null
/** Cut text pasted back in: undoing the paste cuts it again. */
let putBack: string | null = null

/**
 * What a transaction did to the manuscript's words, or null when it was no
 * change the writer made (links to a deleted character turned back into
 * text, say). Undoing takes back what was counted; moving text by dragging,
 * or cutting and pasting it, neither writes nor cuts it.
 */
export function wordChange(tr: Transaction): WordChange | null {
  if (!tr.docChanged || tr.getMeta('addToHistory') === false) return null
  const { gained, lost, taken, given } = measure(tr)
  const event = tr.getMeta('uiEvent')
  // Undo and redo (prosemirror-history's meta, under its plugin key "history").
  const history = tr.getMeta('history$') as { redo?: boolean } | undefined
  const undo = !!history && !history.redo
  // Moved in one go (dragged, or a drag undone): only what it adds or cuts on the whole counts.
  if ((taken && taken === given) || (event === 'drop' && taken)) {
    return gained >= lost ? { added: gained - lost, cut: 0 } : { added: 0, cut: lost - gained }
  }
  if (event === 'cut') {
    lastCut = taken || null
    putBack = null
  }
  // Cut text pasted (or that paste redone), or that paste undone: it's moved, so the cut is taken back, or counts again.
  if (lastCut && given === lastCut && (event === 'paste' || history?.redo)) {
    putBack = lastCut
    lastCut = null
    return { added: 0, cut: lost, uncut: gained }
  }
  if (undo && putBack && taken === putBack) {
    lastCut = putBack
    putBack = null
    return { added: 0, cut: lost, uncut: gained }
  }
  if (undo) {
    // The cut undone: what was cut is back where it was, so pasting it would be new words.
    if (lastCut && given === lastCut) lastCut = null
    return { added: 0, cut: 0, uncut: gained, unwritten: lost }
  }
  return { added: gained, cut: lost }
}
