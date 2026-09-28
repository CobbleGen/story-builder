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
