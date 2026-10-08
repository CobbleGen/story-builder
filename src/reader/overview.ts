import type { MapNode } from '../types'
import { displayName } from '../lib/mentions'
import { outlineWords, totalWords } from '../lib/progress'
import { beatsInBook, storyOrder } from '../store/storyOps'
import { chapterFacts, jumpsOf } from './chapters'
import { count, kindNoun, type Story } from './story'
import { clip } from './text'

// The whole story at a glance: the place to start, with pointers to where
// each part is told in full.

const CARD_KINDS: Record<MapNode['kind'], [string, string]> = {
  character: ['character', 'characters'],
  element: ['place or thing', 'places or things'],
  arc: ['arc', 'arcs'],
  chapter: ['chapter', 'chapters'],
  beat: ['beat', 'beats'],
  note: ['note', 'notes'],
  text: ['text box', 'text boxes'],
  image: ['picture', 'pictures'],
  container: ['group', 'groups'],
}

export function overview(story: Story): string {
  const { data } = story
  const beats = Object.values(data.beats)
  const words = totalWords(data.texts)
  const out = [
    `# ${data.title.trim() || 'Untitled story'}`,
    [
      `${count(data.chapters.length, 'chapter')} · ${count(words, 'word')} written in the manuscript`,
      `${count(beats.length, 'beat')} planned (${beats.filter((b) => b.done).length} ticked off as written) in ${count(data.arcs.length, 'arc')}`,
      `${count(data.characters.length, 'character')} · ${count(data.elements.length, 'place, object or group', 'places, objects or groups')} · ${count(data.mindMaps.length, 'mind map')}`,
      `${count(outlineWords(data).total, 'word')} of outline notes`,
    ].join('\n'),
  ]
  const goals = [
    data.goals.draft ? `${count(data.goals.draft, 'word')} for the draft (${Math.round((words / data.goals.draft) * 100)}% there)` : '',
    data.goals.daily ? `${count(data.goals.daily, 'word')} a day` : '',
  ].filter(Boolean)
  if (goals.length) out.push(`Goals: ${goals.join('; ')}.`)

  // Chapters
  const chapters = data.chapters.map((c) => {
    const lines = [`${story.numberOf(c.id)}. ${story.plain(c.title) || '(untitled)'} — ${chapterFacts(story, c)}`]
    const summary = story.plain(c.summary)
    if (summary) lines.push(`   ${summary}`)
    const planned = c.beatIds.map((id) => data.beats[id]).filter(Boolean)
    if (planned.length) lines.push(`   Beats: ${planned.map((b) => `${story.beatName(b)}${b.done ? ' (written)' : ''}`).join('; ')}`)
    return lines.join('\n')
  })
  out.push(`## Chapters, in reading order\n${chapters.join('\n') || 'No chapters yet.'}`)
  const loose = story.readingBeats.filter((b) => !b.chapterId)
  if (loose.length) out.push(`Beats not in a chapter yet: ${loose.map((b) => story.beatName(b)).join('; ')}`)

  // Arcs
  if (data.arcs.length) {
    const arcs = data.arcs.map((a) => {
      const own = a.beatIds.map((id) => data.beats[id]).filter(Boolean)
      const cast = a.characterIds.length ? ` · characters: ${a.characterIds.map(story.nameOf).join(', ')}` : ''
      const description = story.plain(a.description)
      return `- ${story.arcName(a)} — ${count(own.length, 'beat')} (${own.filter((b) => b.done).length} written)${cast}${description ? `\n  ${clip(description, 300)}` : ''}`
    })
    out.push(`## Arcs (storylines)\n${arcs.join('\n')}`)
  }

  // Characters, places and things, briefly
  const brief = (item: { description: string; attributes: { label: string; value: string }[] }) => {
    const description = story.plain(item.description)
    const details = item.attributes
      .filter((a) => a.label.trim() && story.plain(a.value))
      .slice(0, 4)
      .map((a) => `${a.label.trim()}: ${clip(story.plain(a.value), 80)}`)
    return [description ? clip(description, 220) : '', details.length ? `(${details.join('; ')})` : ''].filter(Boolean).join(' ')
  }
  if (data.characters.length) {
    const lines = data.characters.map((c) => {
      const pov = data.chapters.filter((ch) => ch.povCharacterId === c.id).map((ch) => story.numberOf(ch.id))
      const text = brief(c)
      return `- ${displayName(c)}${text ? ` — ${text}` : ''}${pov.length ? ` · point of view of chapter${pov.length > 1 ? 's' : ''} ${pov.join(', ')}` : ''}`
    })
    out.push(`## Characters\n${lines.join('\n')}`)
  }
  if (data.elements.length) {
    const lines = data.elements.map((e) => {
      const text = brief(e)
      return `- ${displayName(e)} (${kindNoun(e)})${text ? ` — ${text}` : ''}`
    })
    out.push(`## Places, objects and groups\n${lines.join('\n')}`)
  }

  // Story time, in brief
  const time: string[] = []
  const jumps = jumpsOf(story)
  if (!data.timeline.length) time.push('Story time follows the reading order (the writer hasn’t arranged it apart from the chapters).')
  else time.push('The writer has arranged story time on the timeline, apart from the reading order.')
  if (jumps.size) {
    const told = story.readingBeats.filter((b) => jumps.has(b.id)).map((b) => `“${story.beatName(b)}” (${jumps.get(b.id)})`)
    time.push(`Told out of order: ${told.join(', ')}.`)
  }
  const order = storyOrder(data)
  const inBook = beatsInBook(data)
  const before = order.slice(0, order.findIndex((id) => inBook.has(id))).filter((id) => !inBook.has(id))
  const after = order.filter((id) => !inBook.has(id) && !before.includes(id))
  if (before.length) time.push(`Backstory, before the book begins: ${before.map((id) => story.beatName(data.beats[id])).join('; ')}.`)
  if (after.length) time.push(`Aftermath, after the book ends: ${after.map((id) => story.beatName(data.beats[id])).join('; ')}.`)
  if (inBook.size && (before.length || after.length)) {
    const first = order.find((id) => inBook.has(id))!
    time.push(`The book begins with “${story.beatName(data.beats[first])}”.`)
  }
  out.push(`## Story time\n${time.join('\n')}`)

  // Mind maps
  if (data.mindMaps.length) {
    const maps = data.mindMaps.map((m) => {
      const kinds = new Map<MapNode['kind'], number>()
      for (const n of m.nodes) kinds.set(n.kind, (kinds.get(n.kind) ?? 0) + 1)
      const parts = [...kinds].map(([k, n]) => count(n, ...CARD_KINDS[k]))
      return `- ${m.name || 'Untitled map'} — ${parts.join(', ') || 'empty'}; ${count(m.edges.length, 'line')}`
    })
    out.push(`## Mind maps\n${maps.join('\n')}`)
  }

  out.push(
    '## Reading more\nread_chapter (one chapter with its plan), read_manuscript (the text straight through), get_outline (every beat), get_timeline (story time), get_characters and get_places_and_things (full profiles; give a name for one in depth), get_mind_maps (the boards, notes and lines), search_story (anything, anywhere), get_writing_progress (words, goals, the last two weeks).',
  )
  return out.join('\n\n')
}
