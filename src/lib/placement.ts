import type { ChapterLayout } from '../store/storyOps'

/**
 * Index to insert at given the vertical midpoints of the other cards in a list
 * (in order) and the pointer's y position: the number of cards above the pointer.
 * Midpoints exclude the dragged card, which keeps the result stable as the
 * placeholder moves.
 */
export function insertionIndex(midpoints: number[], y: number): number {
  let i = 0
  while (i < midpoints.length && midpoints[i] < y) i++
  return i
}

/**
 * Moves a beat to chapterId at index (or out of every chapter when chapterId is
 * null). Returns the same layout object when nothing changes, so callers can
 * skip re-rendering.
 */
export function moveInLayout(
  layout: ChapterLayout,
  beatId: string,
  chapterId: string | null,
  index = Number.POSITIVE_INFINITY,
): ChapterLayout {
  const from = Object.keys(layout).find((id) => layout[id].includes(beatId)) ?? null
  if (from === chapterId) {
    if (chapterId === null) return layout
    const current = layout[chapterId].indexOf(beatId)
    const clamped = Math.min(index, layout[chapterId].length - 1)
    if (current === clamped) return layout
  }
  const next: ChapterLayout = { ...layout }
  if (from !== null) next[from] = layout[from].filter((id) => id !== beatId)
  if (chapterId !== null) {
    const list = (next[chapterId] ?? []).slice()
    list.splice(Math.min(index, list.length), 0, beatId)
    next[chapterId] = list
  }
  return next
}
