import { describe, expect, it } from 'vitest'
import { labelSpans, timeJumps } from './timeline'

describe('timeline helpers', () => {
  it('finds nothing out of order in a straight story', () => {
    expect(timeJumps(['a', 'b', 'c'], ['a', 'b', 'c']).size).toBe(0)
  })

  it('marks a flashback: read late, happened early', () => {
    // Read a, b, c, then the memory m; m happened before everything.
    const jumps = timeJumps(['m', 'a', 'b', 'c'], ['a', 'b', 'c', 'm'])
    expect([...jumps]).toEqual([['m', 'flashback']])
  })

  it('marks a flash-forward: a prologue from the end', () => {
    const jumps = timeJumps(['a', 'b', 'c', 'p'], ['p', 'a', 'b', 'c'])
    expect([...jumps]).toEqual([['p', 'flash-forward']])
  })

  it('leaves out beats that are in no chapter', () => {
    expect(timeJumps(['x', 'a', 'b'], ['a', 'b']).size).toBe(0)
  })

  it('groups neighbouring labels for the top of the timeline', () => {
    const when: Record<string, string> = { a: 'Day 1', b: 'day 1 ', d: 'Day 2', e: 'Day 1' }
    expect(labelSpans(['a', 'b', 'c', 'd', 'e'], (id) => when[id])).toEqual([
      { start: 0, end: 2, label: 'Day 1' },
      { start: 3, end: 4, label: 'Day 2' },
      { start: 4, end: 5, label: 'Day 1' },
    ])
  })
})
