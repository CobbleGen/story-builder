import { describe, expect, it } from 'vitest'
import { DEFAULT_STYLE, FONTS, bookStyleOf, chapterNumber, fontUrl, numberWords, roman } from './bookStyle'
import { emptyStory, normalizeStory, setBookStyle } from '../store/storyOps'

describe('chapter numbers', () => {
  it('writes numbers out', () => {
    expect([1, 7, 13, 20, 21, 45, 99, 100, 105, 342, 1000, 2024].map(numberWords)).toEqual([
      'One',
      'Seven',
      'Thirteen',
      'Twenty',
      'Twenty-One',
      'Forty-Five',
      'Ninety-Nine',
      'One Hundred',
      'One Hundred Five',
      'Three Hundred Forty-Two',
      'One Thousand',
      'Two Thousand Twenty-Four',
    ])
  })

  it('writes Roman numerals', () => {
    expect([1, 4, 9, 14, 40, 90, 400, 1994, 3999].map(roman)).toEqual(['I', 'IV', 'IX', 'XIV', 'XL', 'XC', 'CD', 'MCMXCIV', 'MMMCMXCIX'])
  })

  it('numbers a chapter as the style says', () => {
    const as = (numbering: Parameters<typeof chapterNumber>[0]['numbering']) => chapterNumber({ numbering }, 12)
    expect([as('chapter-number'), as('chapter-word'), as('word'), as('number'), as('roman')]).toEqual([
      'Chapter 12',
      'Chapter Twelve',
      'Twelve',
      '12',
      'XII',
    ])
  })
})

describe('the book’s style', () => {
  it('fills in what a save leaves out, and puts right what’s wrong', () => {
    expect(bookStyleOf(undefined)).toEqual(DEFAULT_STYLE)
    expect(bookStyleOf('nonsense')).toEqual(DEFAULT_STYLE)
    const style = bookStyleOf({ font: 'comic-sans', size: 99, leading: 0.2, paragraphs: 'spaced', initial: 'drop', sceneBreak: 'fleuron', pageSize: 'a7', pages: 'yes' })
    expect(style).toEqual({ ...DEFAULT_STYLE, size: 20, leading: 1, paragraphs: 'spaced', initial: 'drop', sceneBreak: 'fleuron' })
    expect(bookStyleOf({ size: 11.3, leading: 1.4199999 })).toMatchObject({ size: 11.5, leading: 1.4 })
  })

  it('is changed a part at a time, as one step', () => {
    const data = emptyStory()
    const next = setBookStyle(data, { font: 'eb-garamond', size: 11 })
    expect(next.style).toEqual({ ...DEFAULT_STYLE, font: 'eb-garamond', size: 11 })
    expect(setBookStyle(next, { font: 'eb-garamond' })).toBe(next)
    // Something not right is left as it was.
    expect(setBookStyle(next, { font: 'wingdings' }).style.font).toBe('eb-garamond')
  })

  it('is kept with the story, and an older story gets the usual one', () => {
    const data = setBookStyle(emptyStory(), { initial: 'raised', pages: true })
    expect(normalizeStory(JSON.parse(JSON.stringify(data))).style).toEqual(data.style)
    const { style: _, ...old } = emptyStory()
    expect(normalizeStory(old).style).toEqual(DEFAULT_STYLE)
  })

  it('loads each typeface from Google Fonts', () => {
    expect(fontUrl(FONTS[1])).toBe('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400;1,700&display=swap')
    expect(fontUrl(FONTS[1], 'EB Garamond')).toBe('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400&text=EB%20Garamond&display=swap')
    expect(new Set(FONTS.map((f) => f.id)).size).toBe(FONTS.length)
  })
})
