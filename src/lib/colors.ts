export interface ArcColor {
  name: string
  value: string
}

export const ARC_COLORS: ArcColor[] = [
  { name: 'Crimson', value: '#e5484d' },
  { name: 'Orange', value: '#f76b15' },
  { name: 'Amber', value: '#e2a336' },
  { name: 'Grass', value: '#46a758' },
  { name: 'Teal', value: '#12a594' },
  { name: 'Sky', value: '#0797b9' },
  { name: 'Blue', value: '#3e63dd' },
  { name: 'Violet', value: '#6e56cf' },
  { name: 'Plum', value: '#ab4aba' },
  { name: 'Pink', value: '#d6409f' },
  { name: 'Bronze', value: '#a18072' },
  { name: 'Slate', value: '#6f7480' },
]

/** First palette color not already used by an arc, so new arcs stay distinguishable. */
export function nextArcColor(used: string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()))
  const free = ARC_COLORS.find((c) => !taken.has(c.value.toLowerCase()))
  return (free ?? ARC_COLORS[used.length % ARC_COLORS.length]).value
}

// ---------- Any colour ----------

/** The colours sticky notes, text boxes and containers had by name, before any colour could be picked. */
export const PAPER_NAMES: Record<string, string> = {
  yellow: '#fbe7a1',
  pink: '#f9c9d9',
  blue: '#c7dcf7',
  green: '#cfe9c8',
  purple: '#dccff5',
  orange: '#fbd2ad',
  white: '#ffffff',
}

/** A colour as #rrggbb, from a hex colour (#rgb or #rrggbb) or an old colour name; undefined if it's neither. */
export function cleanColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim().toLowerCase()
  if (v in PAPER_NAMES) return PAPER_NAMES[v]
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  const long = /^#?([0-9a-f]{6})$/.exec(v)
  return long ? `#${long[1]}` : undefined
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

/** Hue (0–360), saturation and value (0–1) to #rrggbb. */
export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return `#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`
}

/** #rrggbb to hue (0–360), saturation and value (0–1). */
export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const [r, g, b] = channels(cleanColor(hex) ?? '#000000')
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max }
}

/** How bright a colour looks (WCAG relative luminance, 0–1). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(cleanColor(hex) ?? '#000000').map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Whether writing on this colour reads better in light ink than in dark. */
export const needsLightInk = (hex: string) => luminance(hex) < 0.22

/** Whether this colour is so pale it needs an edge to stand out from the board. */
export const isPale = (hex: string) => luminance(hex) > 0.9
