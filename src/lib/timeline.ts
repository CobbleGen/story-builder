// Helpers for the timeline: which beats are told out of order, and the
// labels along its top.

/** A beat told out of order: before things that happen before it, or after things that happen after it. */
export type Jump = 'flashback' | 'flash-forward'

/**
 * Which beats are told out of order, comparing when they happen (`story`)
 * with when they're read (`reading`, beats in chapters only). The longest
 * run of beats told in the order they happen counts as the main line; each
 * other beat is a flashback when it's read later than what happens after it,
 * and a flash-forward when it's read earlier than what happens before it.
 */
export function timeJumps(story: string[], reading: string[]): Map<string, Jump> {
  const read = new Map(reading.map((id, i) => [id, i]))
  const seq = story.filter((id) => read.has(id))
  const at = seq.map((id) => read.get(id)!)
  // Longest increasing run of reading positions (patience sorting).
  const tails: number[] = []
  const prev: number[] = at.map(() => -1)
  at.forEach((value, i) => {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (at[tails[mid]] < value) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
  })
  const main = new Set<number>()
  for (let k = tails.length ? tails[tails.length - 1] : -1; k !== -1; k = prev[k]) main.add(k)

  const jumps = new Map<string, Jump>()
  at.forEach((value, i) => {
    if (main.has(i)) return
    let after = i + 1
    while (after < at.length && !main.has(after)) after++
    let before = i - 1
    while (before >= 0 && !main.has(before)) before--
    if (after < at.length && value > at[after]) jumps.set(seq[i], 'flashback')
    else if (before >= 0 && value < at[before]) jumps.set(seq[i], 'flash-forward')
  })
  return jumps
}

export interface Span {
  /** First column, counted from 0. */
  start: number
  /** Just past the last column. */
  end: number
  label: string
}

/** Runs of neighbouring items with the same label, for the timeline's top edge. */
export function labelSpans(ids: string[], labelOf: (id: string) => string | undefined): Span[] {
  const spans: Span[] = []
  ids.forEach((id, i) => {
    const label = labelOf(id)?.trim()
    if (!label) return
    const last = spans[spans.length - 1]
    if (last && last.end === i && last.label.toLowerCase() === label.toLowerCase()) last.end = i + 1
    else spans.push({ start: i, end: i + 1, label })
  })
  return spans
}
