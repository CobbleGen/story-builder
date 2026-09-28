import { describe, expect, it } from 'vitest'
import { activeQuery, lookupOf, mentionToken, parseMentions, plainText, toDisplay, toStored } from './mentions'

const chars = [
  { id: 'chr_a', name: 'Mara', color: '#0a0' },
  { id: 'chr_b', name: 'Mara Quinn', color: '#00a' },
  { id: 'chr_c', name: 'Theo', color: '#a00' },
]
const lookup = lookupOf(chars)
const A = mentionToken('chr_a')
const B = mentionToken('chr_b')
const C = mentionToken('chr_c')

describe('toStored', () => {
  it('links exact names, longest first', () => {
    expect(toStored('@Mara met @Theo', chars)).toBe(`${A} met ${C}`)
    expect(toStored('@Mara Quinn left', chars)).toBe(`${B} left`)
    expect(toStored('@Mara’s boat', chars)).toBe(`${A}’s boat`)
  })

  it('leaves partial names, other words and emails alone', () => {
    expect(toStored('@Mar', chars)).toBe('@Mar')
    expect(toStored('@Marathon', chars)).toBe('@Marathon')
    expect(toStored('me@Mara', chars)).toBe('me@Mara')
    expect(toStored('@mara', chars)).toBe('@mara')
  })

  it('round-trips anything typed', () => {
    for (const text of ['@Mara Q', '@Mara Quinn and @Theo', 'a @ b', '@@Theo', '@Theo\n@Mara']) {
      expect(toDisplay(toStored(text, chars), lookup)).toBe(text)
    }
  })
})

describe('rendering', () => {
  it('splits text into mentions with colors', () => {
    expect(parseMentions(`Hi ${C}!`, lookup)).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'mention', id: 'chr_c', text: '@Theo', color: '#a00', known: true },
      { kind: 'text', text: '!' },
    ])
  })

  it('shows plain names outside the editor', () => {
    expect(plainText(`${A} & ${C}`, lookup)).toBe('Mara & Theo')
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
