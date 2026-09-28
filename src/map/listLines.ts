// A text box shown as a list keeps its items as lines of its text, and the
// ticked items of a checklist by line number. These edits keep the ticks on
// the right items as lines come and go.

export interface ListState {
  text: string
  checked: number[]
}

export const listItems = (text: string) => text.split('\n')

/** Sets item `i`; a value with line breaks (a paste) becomes several items. */
export function setItem(s: ListState, i: number, value: string): ListState {
  const items = listItems(s.text)
  const parts = value.split('\n')
  items.splice(i, 1, ...parts)
  const added = parts.length - 1
  return { text: items.join('\n'), checked: added ? s.checked.map((c) => (c > i ? c + added : c)) : s.checked }
}

/** Adds an item at position `at`. */
export function insertItem(s: ListState, at: number, value = ''): ListState {
  const items = listItems(s.text)
  items.splice(at, 0, value)
  return { text: items.join('\n'), checked: s.checked.map((c) => (c >= at ? c + 1 : c)) }
}

/** Removes item `at`; the last item left is emptied instead. */
export function removeItem(s: ListState, at: number): ListState {
  const items = listItems(s.text)
  if (items.length <= 1) return { text: '', checked: [] }
  items.splice(at, 1)
  return {
    text: items.join('\n'),
    checked: s.checked.filter((c) => c !== at).map((c) => (c > at ? c - 1 : c)),
  }
}

export function toggleItem(checked: number[], i: number): number[] {
  return checked.includes(i) ? checked.filter((c) => c !== i) : [...checked, i].sort((a, b) => a - b)
}

/** Text turned into list items: one per non-empty line. */
export function toItems(text: string): string {
  const items = listItems(text).filter((line) => line.trim())
  return items.length ? items.join('\n') : ''
}
