import { describe, expect, it } from 'vitest'
import { cleanTextSize, stepTextSize, textLook } from './textSize'

describe('text sizes', () => {
  it('steps to the next size up or down, from any size', () => {
    expect(stepTextSize(20, 1)).toBe(24)
    expect(stepTextSize(20, -1)).toBe(18)
    expect(stepTextSize(14.5, 1)).toBe(16)
    expect(stepTextSize(14.5, -1)).toBe(14)
    expect(stepTextSize(200, 1)).toBe(200)
    expect(stepTextSize(6, -1)).toBe(6)
  })

  it('keeps typed sizes within bounds', () => {
    expect(cleanTextSize(3)).toBe(6)
    expect(cleanTextSize(17.26)).toBe(17.3)
    expect(cleanTextSize(Number.NaN)).toBeUndefined()
    expect(cleanTextSize('md')).toBe(20)
  })

  it('looks like a heading, then a title, as it gets bigger', () => {
    expect([14, 18, 27, 28, 80].map(textLook)).toEqual(['body', 'heading', 'heading', 'title', 'title'])
  })
})
