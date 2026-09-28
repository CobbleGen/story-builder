import type { Arc, Beat } from '../types'
import type { Highlight } from '../store/uiStore'
import { mentions } from './mentions'

/**
 * Whether a beat belongs to what the sidebar is highlighting: the arc itself,
 * or for a character, an arc they're in or a beat that mentions them.
 */
export function involves(beat: Beat, arc: Arc | undefined, highlight: NonNullable<Highlight>): boolean {
  if (highlight.kind === 'arc') return beat.arcId === highlight.id
  return (
    !!arc?.characterIds.includes(highlight.id) ||
    mentions(beat.title, highlight.id) ||
    mentions(beat.description, highlight.id)
  )
}
