import { describe, expect, it } from 'vitest'
import { buildSampleStory } from '../store/sampleStory'
import { lookupOf } from './mentions'
import { placeName, step, type Trail } from './trail'

const at = (key: string, path: string) => ({ key, path })
const EMPTY: Trail = { entries: [], at: -1 }
const previous = (t: Trail) => t.entries[t.at - 1]?.path ?? null

describe('the trail of pages visited', () => {
  it('follows new pages, going back and forward, and pages changed in place', () => {
    let t = step(EMPTY, at('default', '/timeline'), 'POP')
    expect(t).toEqual({ entries: [at('default', '/timeline')], at: 0 })
    expect(previous(t)).toBeNull()
    t = step(t, at('k1', '/arcs/a1'), 'PUSH')
    t = step(t, at('k2', '/characters/c1'), 'PUSH')
    expect(previous(t)).toBe('/arcs/a1')
    // Back, then back again
    t = step(t, at('k1', '/arcs/a1'), 'POP')
    expect(previous(t)).toBe('/timeline')
    t = step(t, at('default', '/timeline'), 'POP')
    expect(t.at).toBe(0)
    // Forward again, then somewhere new: what was ahead is gone
    t = step(t, at('k1', '/arcs/a1'), 'POP')
    t = step(t, at('k3', '/map'), 'PUSH')
    expect(t.entries.map((e) => e.key)).toEqual(['default', 'k1', 'k3'])
    expect(previous(t)).toBe('/arcs/a1')
    // Changed in place
    t = step(t, at('k4', '/map/m2'), 'REPLACE')
    expect(t.entries.map((e) => e.path)).toEqual(['/timeline', '/arcs/a1', '/map/m2'])
    expect(t.at).toBe(2)
    // Told the same page twice, it's still one page
    expect(step(t, at('k4', '/map/m2'), 'PUSH')).toEqual(t)
  })

  it('starts afresh at a page it hasn’t seen, and keeps the latest 200', () => {
    let t = step(EMPTY, at('a', '/'), 'POP')
    t = step(t, at('b', '/timeline'), 'PUSH')
    t = step(t, at('zz', '/write'), 'POP')
    expect(t).toEqual({ entries: [at('zz', '/write')], at: 0 })
    for (let i = 0; i < 250; i++) t = step(t, at(`k${i}`, `/arcs/${i}`), 'PUSH')
    expect(t.entries).toHaveLength(200)
    expect(t.at).toBe(199)
    expect(previous(t)).toBe('/arcs/248')
  })
})

describe('the names of pages to go back to', () => {
  const story = buildSampleStory()
  const lookup = lookupOf([...story.characters, ...story.elements])
  it('names views, and arcs, characters and items by their own names', () => {
    expect(placeName('/', story, lookup)).toBe('Chapter board')
    expect(placeName('/timeline', story, lookup)).toBe('Timeline')
    expect(placeName('/write/ch_1', story, lookup)).toBe('Manuscript')
    expect(placeName('/map', story, lookup)).toBe('Mind map')
    expect(placeName(`/arcs/${story.arcs[0].id}`, story, lookup)).toBe('The missing ship')
    expect(placeName(`/characters/${story.characters[0].id}`, story, lookup)).toBe(story.characters[0].name)
    expect(placeName(`/elements/${story.elements[0].id}`, story, lookup)).toBe(story.elements[0].name)
    expect(placeName('/arcs/gone', story, lookup)).toBe('Back')
  })
})
