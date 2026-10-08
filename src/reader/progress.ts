import { outlineWords, recentDays, totalWords, writingStreak } from '../lib/progress'
import { chapterFacts } from './chapters'
import { count, statusLabel, type Story } from './story'

// How far along the writing is: words, goals, chapters, days.

const dayName = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** `today` is a date (YYYY-MM-DD) in the writer's days, which the word log is kept in. */
export function progress(story: Story, today: string): string {
  const { data } = story
  const words = totalWords(data.texts)
  const outline = outlineWords(data)
  const beats = Object.values(data.beats)
  const out = [`# Writing progress: ${data.title.trim() || 'Untitled story'}`]

  const lines = [`Manuscript: ${count(words, 'word')}.`]
  if (data.goals.draft) lines.push(`Goal for the draft: ${count(data.goals.draft, 'word')} (${Math.round((words / data.goals.draft) * 100)}% there).`)
  if (data.goals.daily) lines.push(`Daily goal: ${count(data.goals.daily, 'word')}.`)
  lines.push(`Outline notes (beats, arcs, chapter titles and summaries): ${count(outline.total, 'word')}.`)
  lines.push(`Beats: ${count(beats.length, 'beat')} planned, ${beats.filter((b) => b.done).length} ticked off as written, ${beats.filter((b) => !b.chapterId).length} not in a chapter yet.`)
  out.push(lines.join('\n'))

  if (data.chapters.length) {
    const statuses = new Map<string, number>()
    for (const c of data.chapters) statuses.set(statusLabel(c), (statuses.get(statusLabel(c)) ?? 0) + 1)
    out.push(
      `## Chapters (${[...statuses].map(([s, n]) => `${n} ${s.toLowerCase()}`).join(', ')})\n${data.chapters
        .map((c) => `${story.numberOf(c.id)}. ${story.plain(c.title) || '(untitled)'} — ${chapterFacts(story, c)}`)
        .join('\n')}`,
    )
  }

  const days = recentDays(data.wordLog, today, 14)
  if (days.some((d) => d.words)) {
    const streak = writingStreak(data.wordLog, today, data.goals.daily)
    out.push(
      `## The last two weeks (words added, less words cut)\n${days.map((d) => `${dayName.format(new Date(`${d.day}T12:00:00Z`))}: ${d.words.toLocaleString('en')}`).join('\n')}\n${streak ? `Writing streak: ${count(streak, 'day')}${data.goals.daily ? ' meeting the daily goal' : ''}.` : ''}`.trim(),
    )
  } else {
    out.push('## The last two weeks\nNo words written in the manuscript in the last two weeks.')
  }
  return out.join('\n\n')
}
