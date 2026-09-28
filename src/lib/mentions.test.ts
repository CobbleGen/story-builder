import { describe, expect, it } from 'vitest'
import {
  activeQuery,
  applyTextEdit,
  diffEdit,
  linkTyped,
  lookupOf,
  mentionToken,
  parseMentions,
  plainText,
  replaceRange,
  toDisplay,
} from './mentions'

const chars = [
  { id: 'chr_a', name: 'Mara', color: '#0a0' },
  { id: 'chr_b', name: 'Mara Quinn', color: '#00a' },
  { id: 'chr_c', name: 'Theo', color: '#a00' },
]
const lookup = lookupOf(chars)
const A = mentionToken('chr_a')
const B = mentionToken('chr_b')
const C = mentionToken('chr_c')
const link = (text: string, opts?: { skipAt?: number; caret?: number }) => linkTyped(text, chars, lookup, opts)

describe('showing mentions', () => {
  it('shows a mention as the name alone, with its color', () => {
    expect(parseMentions(`Hi ${C}!`, lookup)).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'mention', id: 'chr_c', text: 'Theo', color: '#a00', known: true },
      { kind: 'text', text: '!' },
    ])
    expect(toDisplay(`${A} & ${C}`, lookup)).toBe('Mara & Theo')
    expect(plainText(`${A} & ${C}`, lookup)).toBe('Mara & Theo')
  })

  it('follows renames', () => {
    const renamed = lookupOf([{ id: 'chr_a', name: 'Mara Carrow', color: '#0a0' }])
    expect(toDisplay(`${A} left`, renamed)).toBe('Mara Carrow left')
  })
})

describe('linkTyped', () => {
  it('links typed names, longest first, ignoring case', () => {
    expect(link('@Mara met @Theo').stored).toBe(`${A} met ${C}`)
    expect(link('@Mara Quinn left').stored).toBe(`${B} left`)
    expect(link('@Mara’s boat').stored).toBe(`${A}’s boat`)
    expect(link('@mara').stored).toBe(A)
  })

  it('leaves partial names, other words and emails alone', () => {
    expect(link('@Mar').stored).toBe('@Mar')
    expect(link('@Marathon').stored).toBe('@Marathon')
    expect(link('me@Mara').stored).toBe('me@Mara')
  })

  it('skips the @name still being typed and moves the caret for removed @s', () => {
    expect(link('@Theo', { skipAt: 0, caret: 5 })).toEqual({ stored: '@Theo', caret: 5 })
    expect(link('Hi @Theo x', { caret: 10 })).toEqual({ stored: `Hi ${C} x`, caret: 9 })
  })
})

describe('diffEdit', () => {
  it('places an insertion at the caret, even next to repeated letters', () => {
    expect(diffEdit('Mara', 'MMara', 1)).toEqual({ a: 0, b: 0, inserted: 'M' })
    expect(diffEdit('Mara', 'Maraa', 5)).toEqual({ a: 4, b: 4, inserted: 'a' })
  })

  it('handles deletions and replacements', () => {
    expect(diffEdit('Mara went', 'Mar went', 3)).toEqual({ a: 3, b: 4, inserted: '' })
    expect(diffEdit('Mara went', 'M went', 1)).toEqual({ a: 1, b: 4, inserted: '' })
  })
})

describe('editing text with mentions', () => {
  const stored = `${A} went home`
  const edit = (next: string, caret: number, activeAt: number | null = null) =>
    applyTextEdit(stored, chars, lookup, next, caret, activeAt).stored

  it('keeps mentions when typing next to them', () => {
    expect(edit('Maras went home', 5)).toBe(`${A}s went home`)
    expect(edit('XMara went home', 1)).toBe(`X${A} went home`)
    expect(edit('Mara went home!', 15)).toBe(`${A} went home!`)
  })

  it('turns a mention into plain text when it is edited inside', () => {
    expect(edit('Maxra went home', 3)).toBe('Maxra went home')
    expect(edit('Mar went home', 3)).toBe('Mar went home')
  })

  it('links a typed name once the next word starts', () => {
    const typing = applyTextEdit('Hi ', chars, lookup, 'Hi @Theo', 8, 3)
    expect(typing).toEqual({ stored: 'Hi @Theo', caret: 8 })
    const done = applyTextEdit(typing.stored, chars, lookup, 'Hi @Theo ', 9, null)
    expect(done).toEqual({ stored: `Hi ${C} `, caret: 8 })
  })

  it('inserts a picked suggestion over the typed @query', () => {
    expect(replaceRange('Hi @Th', lookup, 3, 6, `${C} `)).toBe(`Hi ${C} `)
  })
})

describe('activeQuery', () => {
  it('finds the @word being typed', () => {
    expect(activeQuery('Hello @Ma', 9)).toEqual({ start: 6, query: 'Ma' })
    expect(activeQuery('@', 1)).toEqual({ start: 0, query: '' })
    expect(activeQuery('me@Ma', 5)).toBeNull()
    expect(activeQuery('@Ma\nx', 5)).toBeNull()
  })
})
