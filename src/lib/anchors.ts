// A line on the mind map can attach to a spot inside a card: a beat in a
// list, a character's attribute, a paragraph on a chapter's page, an item in
// a list. The spot is named by an anchor:
//
//   beat:<id>, attr:<id>, arc:<id>, chapter:<id>   story items, by id
//   para:<index>:<words>, item:<index>:<words>     paragraphs and list items
//
// Paragraphs and list items have no ids, so they're found again by their
// opening words (a short hash), or failing that by their position.

export type ItemAnchorKind = 'beat' | 'attr' | 'arc' | 'chapter'
export type TextAnchorKind = 'para' | 'item'

const MAX_ANCHOR = 300

export const itemAnchor = (kind: ItemAnchorKind, id: string) => `${kind}:${id}`

/** The story item an anchor points at, for item anchors. */
export function anchorItemId(anchor: string): string | null {
  const m = /^(beat|attr|arc|chapter):(.+)$/.exec(anchor)
  return m ? m[2] : null
}

/** A short, stable fingerprint of a text's opening words. */
function openingHash(text: string): string {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).slice(0, 6).join(' ')
  let h = 5381
  for (let i = 0; i < words.length; i++) h = ((h * 33) ^ words.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export const textAnchor = (kind: TextAnchorKind, index: number, text: string) =>
  `${kind}:${index}:${openingHash(text)}`

/**
 * Which of `texts` each saved text anchor now points at: the one with the
 * same opening words (the nearest, if several), else the one in the same
 * position. Returns index -> anchors.
 */
export function resolveTextAnchors(anchors: string[], kind: TextAnchorKind, texts: string[]): Map<number, string[]> {
  const hashes = texts.map(openingHash)
  const out = new Map<number, string[]>()
  for (const anchor of new Set(anchors)) {
    const m = new RegExp(`^${kind}:(\\d+):(\\w+)$`).exec(anchor)
    if (!m) continue
    const index = Number(m[1])
    let best = -1
    hashes.forEach((h, i) => {
      if (h === m[2] && (best === -1 || Math.abs(i - index) < Math.abs(best - index))) best = i
    })
    if (best === -1 && index < texts.length) best = index
    if (best === -1) continue
    out.set(best, [...(out.get(best) ?? []), anchor])
  }
  return out
}

/** A saved anchor, or undefined if it isn't one. */
export function cleanAnchor(value: unknown): string | undefined {
  return typeof value === 'string' && value.includes(':') && value.length <= MAX_ANCHOR ? value : undefined
}

// Each anchored row has a connection point on both sides; the handle id says which.
export const anchorHandle = (anchor: string, side: 'l' | 'r') => `${anchor}@${side}`

export function anchorOfHandle(handleId: string | null | undefined): string | undefined {
  if (!handleId) return undefined
  const at = handleId.lastIndexOf('@')
  return at > 0 ? handleId.slice(0, at) : undefined
}
