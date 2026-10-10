import { describe, expect, it } from 'vitest'
import { OUTLINES, OUTLINE_GROUPS, outlineKind, spreadSteps } from './outlines'

describe('arc outlines', () => {
  it('are well formed: unique ids, steps in order from start to end, each saying what happens', () => {
    expect(new Set(OUTLINES.map((o) => o.id)).size).toBe(OUTLINES.length)
    for (const o of OUTLINES) {
      expect(OUTLINE_GROUPS).toContain(o.group)
      expect(o.summary.length).toBeGreaterThan(20)
      expect(new Set(o.steps.map((s) => s.id)).size).toBe(o.steps.length)
      expect(o.steps[0].at).toBe(0)
      expect(o.steps[o.steps.length - 1].at).toBe(1)
      o.steps.forEach((s, i) => {
        expect(s.name.trim()).not.toBe('')
        expect(s.what.trim()).not.toBe('')
        if (i) expect(s.at).toBeGreaterThanOrEqual(o.steps[i - 1].at)
      })
    }
    expect(outlineKind('heros-journey')?.steps).toHaveLength(12)
    expect(outlineKind('nope')).toBeUndefined()
  })

  it('spread over the beats by where each step falls', () => {
    const circle = outlineKind('story-circle')!
    const beats = (n: number) => Array.from({ length: n }, (_, i) => `b${i}`)
    // A beat each, in order, first and last on the arc's first and last beats
    const eight = spreadSteps(circle, beats(8))
    expect(Object.values(eight)).toEqual(beats(8))
    const sixteen = Object.values(spreadSteps(circle, beats(16)))
    expect(sixteen[0]).toBe('b0')
    expect(sixteen[7]).toBe('b15')
    expect(new Set(sixteen).size).toBe(8)
    // Save the Cat's early beats bunch up; with a beat each they still get one each, in order
    const cat = outlineKind('save-the-cat')!
    const spread = Object.values(spreadSteps(cat, beats(15)))
    expect(spread).toEqual(beats(15))
    // Fewer beats than steps: some share, still in order
    const three = Object.values(spreadSteps(circle, beats(3)))
    expect(three[0]).toBe('b0')
    expect(three[7]).toBe('b2')
    expect([...three].sort()).toEqual(three)
    expect(spreadSteps(circle, [])).toEqual({})
  })
})
