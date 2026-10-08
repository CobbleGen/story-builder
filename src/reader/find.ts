import { buildIndex, search, type Hit, type HitGroup } from '../lib/search'
import type { Story } from './story'

// Searching the whole story, as the app's own search does: every word of the
// query must be there; "quoted words" are found together.

/** The most results listed in one reply. */
const MAX_HITS = 80

function hitLine(story: Story, group: HitGroup, hit: Hit): string {
  const snippet = hit.snippet ? `“${hit.snippet.text}”` : ''
  const label = hit.snippetLabel ? ` (${hit.snippetLabel})` : ''
  switch (group.kind) {
    case 'text':
      return `- ${hit.title.text}, paragraph ${(hit.block ?? 0) + 1}: ${snippet}`
    case 'beat': {
      const beat = story.data.beats[hit.id]
      const where = beat?.chapterId ? `chapter ${story.numberOf(beat.chapterId)}` : 'not in a chapter'
      return `- “${hit.title.text}” (${where})${snippet ? `${label}: ${snippet}` : ''}`
    }
    case 'note':
      return `- On the map “${hit.title.text}”: ${snippet}`
    case 'map':
      return `- The map “${hit.title.text}”`
    default:
      return `- ${hit.title.text}${snippet ? `${label}: ${snippet}` : ''}`
  }
}

export function searchStory(story: Story, query: string): string {
  const groups = search(buildIndex(story.data, story.lookup), query)
  const head = `# Search for “${query}” in ${story.data.title.trim() || 'Untitled story'}`
  if (!groups.length) {
    return `${head}\n\nNothing found. Every word has to be found; put "quotes" around words to find them together. Names linked with @ are found by name.`
  }
  const total = groups.reduce((n, g) => n + g.hits.length, 0)
  const out = [head, `${total} found.`]
  let left = MAX_HITS
  for (const group of groups) {
    if (left <= 0) break
    const hits = group.hits.slice(0, left)
    left -= hits.length
    out.push(`## ${group.label} (${group.hits.length})\n${hits.map((h) => hitLine(story, group, h)).join('\n')}`)
  }
  if (total > MAX_HITS) out.push(`(Only the first ${MAX_HITS} are listed; add words to narrow it down.)`)
  return out.join('\n\n')
}
