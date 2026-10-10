import type { Beat } from '../types'
import { outlineKind } from '../lib/outlines'
import { isMoment, storyStops } from '../store/storyOps'
import { beatLines, chapterFacts, jumpsOf } from './chapters'
import type { Story } from './story'

// The plan: chapters with their beats, beats not placed yet, and each arc's
// beats in its own order; and story time, the order things happen in.

const titleOf = (story: Story) => story.data.title.trim() || 'Untitled story'

export function outline(story: Story): string {
  const { data } = story
  const jumps = jumpsOf(story)
  const out = [
    `# Outline of ${titleOf(story)}`,
    'Beats are the planned events of the story. Each belongs to an arc (a storyline, plot thread or relationship) and can be placed in a chapter; “(written)” marks beats the writer has ticked off as written in the manuscript.',
  ]

  const chapters = data.chapters.map((c) => {
    const lines = [`### ${story.chapterName(c)}`, chapterFacts(story, c)]
    const summary = story.plain(c.summary)
    if (summary) lines.push(`Summary: ${summary}`)
    const beats = c.beatIds.map((id) => data.beats[id]).filter(Boolean)
    lines.push(beats.length ? beats.map((b, i) => `${i + 1}. ${beatLines(story, b, { jumps })}`).join('\n') : 'No beats planned.')
    return lines.join('\n')
  })
  out.push(`## Chapters and their beats, in reading order\n\n${chapters.join('\n\n') || 'No chapters yet.'}`)

  const loose = story.readingBeats.filter((b) => !b.chapterId)
  if (loose.length) out.push(`## Beats not in any chapter yet\n${loose.map((b) => `- ${beatLines(story, b, { jumps })}`).join('\n')}`)

  const arcs = data.arcs.map((a) => {
    const lines = [`### ${story.arcName(a)}`]
    const description = story.plain(a.description)
    if (description) lines.push(description)
    if (a.characterIds.length) lines.push(`Characters in it: ${a.characterIds.map(story.nameOf).join(', ')}`)
    const beats = a.beatIds.map((id) => data.beats[id]).filter(Boolean)
    const where = (b: Beat) => (b.chapterId ? `chapter ${story.numberOf(b.chapterId)}` : 'not in a chapter')
    // The structure the writer laid over the arc, if any: the step each beat stands for.
    const outline = outlineKind(a.outline?.kind)
    const stepsOn = (b: Beat) => (outline ? outline.steps.filter((st) => a.outline!.steps[st.id] === b.id).map((st) => st.name) : [])
    if (outline) lines.push(`Outline: ${outline.name}, laid over this arc by the writer (${outline.summary}) Each beat below names the step of it that it stands for.`)
    lines.push(
      beats.length
        ? beats
            .map((b, i) => {
              const steps = stepsOn(b)
              return `${i + 1}. ${story.beatName(b)}${b.done ? ' (written)' : ''} — ${where(b)}${steps.length ? ` — outline: ${steps.join('; ')}` : ''}`
            })
            .join('\n')
        : 'No beats yet.',
    )
    const loose = outline?.steps.filter((st) => !a.outline!.steps[st.id]) ?? []
    if (loose.length) lines.push(`Steps of the outline on no beat yet: ${loose.map((st) => st.name).join('; ')}`)
    return lines.join('\n')
  })
  out.push(`## Arcs, each with its beats in the arc's own order\n\n${arcs.join('\n\n') || 'No arcs yet.'}`)
  return out.join('\n\n')
}

/**
 * Story time: every beat in the order it happens, beats happening at once
 * together, backstory before where the book begins and aftermath after
 * where it ends, and which beats are told out of order.
 */
export function timeline(story: Story): string {
  const { data } = story
  const jumps = jumpsOf(story)
  const out = [
    `# Story time in ${titleOf(story)}`,
    data.timeline.length
      ? 'The order things happen in the story’s world, as the writer arranged it on the timeline; it can differ from the order they’re read in. Beats joined by “+ at the same moment” happen at once. [when] is the writer’s note of when a beat happens.'
      : 'The writer hasn’t arranged story time apart from the chapters, so it follows the reading order (beats in no chapter come last). Beats joined by “+ at the same moment” happen at once. [when] is the writer’s note of when a beat happens.',
  ]
  const describe = (b: Beat) => {
    const where = b.chapterId ? `chapter ${story.numberOf(b.chapterId)}` : 'in no chapter'
    const jump = jumps.get(b.id)
    return `${story.beatName(b)} (${story.arcName(story.arc(b.arcId))}, ${where}${jump ? `, ${jump}` : ''})`
  }
  const sections: { title: string; lines: string[] }[] = [{ title: 'Before the book begins (backstory)', lines: [] }]
  let n = 0
  for (const stop of storyStops(data)) {
    if (!isMoment(stop)) {
      sections.push({ title: stop.marker === 'start' ? 'The book, from where it begins to where it ends' : 'After the book ends (aftermath)', lines: [] })
      continue
    }
    const beats = stop.beats.map((id) => data.beats[id]).filter(Boolean)
    if (!beats.length) continue
    const when = beats.map((b) => b.when?.trim()).find(Boolean)
    const [first, ...rest] = beats
    sections[sections.length - 1].lines.push(
      `${++n}. ${when ? `[${when}] ` : ''}${describe(first)}${rest.map((b) => ` + at the same moment: ${describe(b)}`).join('')}`,
    )
  }
  for (const s of sections) {
    if (s.lines.length || s.title.startsWith('The book')) out.push(`## ${s.title}\n${s.lines.join('\n') || 'Nothing yet.'}`)
  }

  const told = story.readingBeats.filter((b) => jumps.has(b.id))
  if (told.length) {
    const lines = told.map((b) => `- “${story.beatName(b)}” (chapter ${story.numberOf(b.chapterId!)}) is ${jumps.get(b.id) === 'flashback' ? 'a flashback: read after things that happen later' : 'a flash-forward: read before things that happen earlier'}`)
    out.push(`## Told out of order\n${lines.join('\n')}`)
  }
  return out.join('\n\n')
}
