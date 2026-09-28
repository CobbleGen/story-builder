import { describe, expect, it } from 'vitest'
import { insertionIndex, moveInLayout } from './placement'

describe('insertionIndex', () => {
  it('counts the cards above the pointer', () => {
    expect(insertionIndex([], 100)).toBe(0)
    expect(insertionIndex([50, 150, 250], 10)).toBe(0)
    expect(insertionIndex([50, 150, 250], 160)).toBe(2)
    expect(insertionIndex([50, 150, 250], 900)).toBe(3)
  })
})

describe('moveInLayout', () => {
  const layout = { c1: ['a', 'b', 'c'], c2: ['d'] }

  it('moves within a chapter', () => {
    expect(moveInLayout(layout, 'a', 'c1', 2)).toEqual({ c1: ['b', 'c', 'a'], c2: ['d'] })
  })

  it('moves across chapters', () => {
    expect(moveInLayout(layout, 'b', 'c2', 0)).toEqual({ c1: ['a', 'c'], c2: ['b', 'd'] })
  })

  it('brings in a beat that was in no chapter', () => {
    expect(moveInLayout(layout, 'x', 'c2', 1)).toEqual({ c1: ['a', 'b', 'c'], c2: ['d', 'x'] })
  })

  it('removes a beat from every chapter', () => {
    expect(moveInLayout(layout, 'd', null)).toEqual({ c1: ['a', 'b', 'c'], c2: [] })
  })

  it('returns the same object when nothing changes', () => {
    expect(moveInLayout(layout, 'b', 'c1', 1)).toBe(layout)
    expect(moveInLayout(layout, 'c', 'c1')).toBe(layout)
    expect(moveInLayout(layout, 'x', null)).toBe(layout)
  })
})
