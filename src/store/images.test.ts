import { describe, expect, it } from 'vitest'
import { IMAGE_ID, imageIdsIn } from './images'
import { makeId } from '../lib/id'

describe('picture ids', () => {
  it('finds the pictures a saved story refers to', () => {
    const raw = JSON.stringify({ nodes: [{ imageId: 'img_a1' }], texts: { c: { doc: { attrs: { imageId: 'img_b2' } } } }, again: 'img_a1' })
    expect(imageIdsIn(raw)).toEqual(['img_a1', 'img_b2'])
  })

  it('makes ids that look like picture ids', () => {
    for (let i = 0; i < 20; i++) expect(IMAGE_ID.test(makeId('img'))).toBe(true)
  })
})
