import type { ElementKind } from '../types'

/** What each kind of element is called: as a heading, a list, and in a sentence. */
export const ELEMENT_KIND_NAMES: Record<ElementKind, { one: string; many: string; noun: string }> = {
  place: { one: 'Place', many: 'Places', noun: 'place' },
  object: { one: 'Object', many: 'Objects', noun: 'object' },
  group: { one: 'Group', many: 'Groups', noun: 'group' },
  other: { one: 'Other', many: 'Other', noun: 'item' },
}
