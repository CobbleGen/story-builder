import { describe, expect, it } from 'vitest'
import { cleanColor, hexToHsv, hsvToHex, isPale, needsLightInk } from './colors'

describe('colours', () => {
  it('reads hex colours and the old colour names', () => {
    expect(cleanColor('#ABC')).toBe('#aabbcc')
    expect(cleanColor('3e63dd')).toBe('#3e63dd')
    expect(cleanColor('yellow')).toBe('#fbe7a1')
    expect(cleanColor('neon')).toBeUndefined()
    expect(cleanColor('#12345')).toBeUndefined()
  })

  it('turns hue, saturation and value into hex and back', () => {
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000')
    expect(hsvToHex(120, 1, 0.5)).toBe('#008000')
    expect(hsvToHex(0, 0, 1)).toBe('#ffffff')
    for (const hex of ['#3e63dd', '#e2a336', '#12a594', '#6f7480']) {
      const { h, s, v } = hexToHsv(hex)
      expect(hsvToHex(h, s, v)).toBe(hex)
    }
  })

  it('picks light ink for dark colours, and an edge for pale ones', () => {
    expect(needsLightInk('#1e2a4a')).toBe(true)
    expect(needsLightInk('#fbe7a1')).toBe(false)
    expect(isPale('#ffffff')).toBe(true)
    expect(isPale('#c7dcf7')).toBe(false)
  })
})
