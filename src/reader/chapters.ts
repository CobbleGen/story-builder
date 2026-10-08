import type { Beat, Chapter } from '../types'
import type { Jump } from '../lib/timeline'
import { timeJumps } from '../lib/timeline'
import { storyOrder } from '../store/storyOps'
import { NotFound, chapterList, count, findChapter, statusLabel, type Story } from './story'
import { PART_CHARS, clip, linkedPassages, mentionCounts, splitParts, textParagraphs } from './text'

// Chapters: one at a time with everything around it (its plan, who's in it),
// or the manuscript straight through.

/** How much text one read_manuscript reply holds, about 15,000 tokens. */
export const MANUSCRIPT_CHARS = 60_000

const JUMP_WORDS: Record<Jump, string> = {
  flashback: 'a flashback: read after things that happen later',
  'flash-forward': 'a flash-forward: read before things that happen earlier',
}

/** Beats read out of order, by id (see lib/timeline). */
export const jumpsOf = (story: Story) => timeJumps(storyOrder(story.data), story.data.chapters.flatMap((c) => c.beatIds))

export const wordsIn = (story: Story, c: Chapter) => story.data.texts[c.id]?.words ?? 0

/** A chapter's status, length (and target) and point of view, on one line. */
export function chapterFacts(story: Story, c: Chapter): string {
  const words = wordsIn(story, c)
  const target = c.targetWords ? `${c.targetWords.toLocaleString('en')}-word target` : ''
  const facts = [`status: ${statusLabel(c).toLowerCase()}`, words ? `${count(words, 'word')}${target ? ` (${target})` : ''}` : `nothing written yet${target ? ` (${target})` : ''}`]
  if (c.povCharacterId) facts.push(`point of view: ${story.nameOf(c.povCharacterId)}`)
  return facts.join(' · ')
}

/** The other beats happening at the same moment as this one. */
export const sameMoment = (story: Story, b: Beat) =>
  b.moment ? Object.values(story.data.beats).filter((o) => o.id !== b.id && o.moment === b.moment) : []

/**
 * A beat on one line: its title, whether it's written, its arc (and chapter),
 * when it happens, what it happens at once with, and whether it's told out of
 * order; then its description, indented.
 */
export function beatLines(story: Story, b: Beat, opts: { chapter?: boolean; arc?: boolean; jumps?: Map<string, Jump> } = {}): string {
  const facts: string[] = []
  if (opts.arc !== false) facts.push(`arc: ${story.arcName(story.arc(b.arcId))}`)
  if (opts.chapter) {
    const c = story.chapter(b.chapterId)
    facts.push(c ? `chapter ${story.numberOf(c.id)}` : 'not in a chapter')
  }
  if (b.when?.trim()) facts.push(`when: ${b.when.trim()}`)
  const together = sameMoment(story, b)
  if (together.length) facts.push(`at the same moment as ${together.map((o) => `“${story.beatName(o)}”`).join(', ')}`)
  const jump = opts.jumps?.get(b.id)
  if (jump) facts.push(JUMP_WORDS[jump])
  const head = `${story.beatName(b)}${b.done ? ' (written)' : ''}${facts.length ? ` — ${facts.join(' · ')}` : ''}`
  const description = story.plain(b.description)
  return description ? `${head}\n   ${description.replace(/\n+/g, '\n   ')}` : head
}

/** One chapter: its facts, summary, planned beats (and the text written for each), who's named in it, and its text. */
export function readChapter(story: Story, ref: string | number, part = 1): string {
  const c = findChapter(story, ref)
  if (!c) throw new NotFound(`No chapter “${ref}”. The chapters are: ${chapterList(story)}.`)
  const doc = story.data.texts[c.id]?.doc
  const parts = splitParts(doc ? textParagraphs(doc, story) : [], PART_CHARS)
  const total = parts.length
  if (part < 1 || part > total) throw new NotFound(`${story.chapterName(c)} has ${count(total, 'part')}.`)
  const out: string[] = [`# ${story.chapterName(c)}`]

  if (part === 1) {
    out.push(chapterFacts(story, c))
    const summary = story.plain(c.summary)
    if (summary) out.push(`Summary: ${summary}`)

    const beats = c.beatIds.map((id) => story.data.beats[id]).filter(Boolean)
    if (beats.length) {
      const jumps = jumpsOf(story)
      const written = doc ? linkedPassages(doc, story) : new Map<string, string[]>()
      const lines = beats.map((b, i) => {
        const passages = written.get(b.id)
        const where = passages?.length ? `\n   In the text: ${passages.map((p) => `“${clip(p, 220)}”`).join(' … ')}` : ''
        return `${i + 1}. ${beatLines(story, b, { jumps })}${where}`
      })
      out.push(`## Planned beats (${beats.filter((b) => b.done).length} of ${beats.length} ticked off as written)\n${lines.join('\n')}`)
    } else {
      out.push('## Planned beats\nNone planned for this chapter.')
    }

    if (doc) {
      const named = [...mentionCounts(doc)].map(([id, n]) => `${story.nameOf(id)} (${n})`)
      if (named.length) out.push(`## Named in the text\n${named.join(', ')}`)
    }
  }

  if (!parts[0].length) out.push('## Text\nNothing written yet.')
  else {
    const note = total > 1 ? ` (part ${part} of ${total}${part < total ? `; read_chapter with part ${part + 1} for more` : ''})` : ''
    out.push(`## Text${note}\n\n${parts[part - 1].join('\n\n')}`)
  }
  return out.join('\n\n')
}

/**
 * The manuscript straight through, chapter by chapter from `from` to `to`,
 * as much as fits in one reply; it says where to carry on.
 */
export function readManuscript(story: Story, from = 1, to?: number, budget = MANUSCRIPT_CHARS): string {
  const chapters = story.data.chapters
  if (!chapters.length) return `# ${story.data.title || 'Untitled story'}\n\nThere are no chapters yet.`
  const last = Math.min(to ?? chapters.length, chapters.length)
  if (from < 1 || from > last) throw new NotFound(`Chapters go from 1 to ${chapters.length}.`)
  const body: string[] = []
  let used = 0
  let next: string | null = null
  for (let n = from; n <= last; n++) {
    const c = chapters[n - 1]
    const doc = story.data.texts[c.id]?.doc
    const paragraphs = doc ? textParagraphs(doc, story) : []
    const text = paragraphs.length ? paragraphs.join('\n\n') : '(Nothing written yet.)'
    if (used > 0 && used + text.length > budget) {
      next = `To carry on: read_manuscript with from_chapter ${n}.`
      break
    }
    if (text.length > budget) {
      // One very long chapter: its first part here, the rest from read_chapter.
      const parts = splitParts(paragraphs, budget)
      body.push(`## ${story.chapterName(c)}\n\n${parts[0].join('\n\n')}`)
      next = `${story.chapterName(c)} goes on: read_chapter ${n} with part 2${n < last ? `, then read_manuscript with from_chapter ${n + 1}` : ''}.`
      break
    }
    body.push(`## ${story.chapterName(c)}\n\n${text}`)
    used += text.length
  }
  const shown = body.length
  const range = shown === 1 ? `chapter ${from}` : `chapters ${from}–${from + shown - 1}`
  return [`# ${story.data.title || 'Untitled story'}: the manuscript, ${range} of ${chapters.length}`, ...body, ...(next ? [next] : [])].join('\n\n')
}
