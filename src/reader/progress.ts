import { manuscriptWords, outlineWords, recentDays, writingStreak } from '../lib/progress'
import { bestSprint, perMinute } from '../lib/sprints'
import { chapterFacts } from './chapters'
import { count, type Story } from './story'

// How far along the writing is: words, goals, chapters, days.

const dayName = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** `today` is a date (YYYY-MM-DD) in the writer's days, which the word log is kept in. */
export function progress(story: Story, today: string): string {
  const { data } = story
  const words = manuscriptWords(data)
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
    out.push(
      `## Chapters\n${data.chapters
        .map((c) => `${story.numberOf(c.id)}. ${story.plain(c.title) || '(untitled)'} — ${chapterFacts(story, c)}`)
        .join('\n')}`,
    )
  }

  const days = recentDays(data.wordLog, data.wordCuts, today, 14)
  if (days.some((d) => d.added || d.cut)) {
    const streak = writingStreak(data.wordLog, today, data.goals.daily)
    const day = (d: (typeof days)[number]) =>
      `${dayName.format(new Date(`${d.day}T12:00:00Z`))}: ${d.added.toLocaleString('en')} added${d.cut ? `, ${d.cut.toLocaleString('en')} cut` : ''}`
    out.push(
      `## The last two weeks (words added and words cut, counted apart; the daily goal is words added)\n${days.map(day).join('\n')}\n${streak ? `Writing streak: ${count(streak, 'day')}${data.goals.daily ? ' meeting the daily goal' : ''}.` : ''}`.trim(),
    )
  } else {
    out.push('## The last two weeks\nNo words written in the manuscript in the last two weeks.')
  }
  if (data.sprints.length) {
    const best = bestSprint(data.sprints)!
    const words = data.sprints.reduce((n, s) => n + s.words, 0)
    const seconds = data.sprints.reduce((n, s) => n + s.seconds, 0)
    out.push(
      `## Writing sprints\n${count(data.sprints.length, 'timed sprint')}, ${perMinute(words, seconds)} words a minute on average; the best: ${count(best.words, 'word')} in ${count(Math.max(1, Math.round(best.seconds / 60)), 'minute')}.`,
    )
  }
  return out.join('\n\n')
}
