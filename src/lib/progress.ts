import type { StoryData } from '../types'

// Word counts and goals, worked out from the story's texts and word logs.

export const totalWords = (texts: StoryData['texts']) =>
  Object.values(texts).reduce((n, t) => n + (t.words || 0), 0)

/** The book's words: every chapter's (in the open draft). */
export function manuscriptWords(data: Pick<StoryData, 'chapters' | 'texts'>): number {
  return data.chapters.reduce((n, c) => n + (data.texts[c.id]?.words || 0), 0)
}

const MENTION = /@\{[^}]+\}/g

/** The words in a piece of stored text, a mention counting as one (as in the manuscript). */
export const wordsIn = (text: string) => text.replace(MENTION, 'x').split(/\s+/).filter(Boolean).length

/** Words in the outline: beats, arcs, and the chapters' titles and summaries. */
export interface OutlineWords {
  total: number
  beats: number
  arcs: number
  chapters: number
  /** Each arc's own words and its beats', by arc id. */
  byArc: Record<string, number>
}

// Beats, arcs and chapters are replaced whenever they change, so each is counted once.
const counted = new WeakMap<object, number>()
function wordsOf(item: object, ...texts: string[]): number {
  let n = counted.get(item)
  if (n === undefined) {
    n = texts.reduce((sum, text) => sum + wordsIn(text), 0)
    counted.set(item, n)
  }
  return n
}

/**
 * The words written in planning the story, apart from the manuscript: beat
 * titles and descriptions, arc names and descriptions, and chapter titles
 * and summaries.
 */
export function outlineWords(data: Pick<StoryData, 'beats' | 'arcs' | 'chapters'>): OutlineWords {
  const byArc: Record<string, number> = {}
  let arcs = 0
  for (const arc of data.arcs) {
    const n = wordsOf(arc, arc.name, arc.description)
    byArc[arc.id] = n
    arcs += n
  }
  let beats = 0
  for (const beat of Object.values(data.beats)) {
    const n = wordsOf(beat, beat.title, beat.description)
    beats += n
    if (beat.arcId in byArc) byArc[beat.arcId] += n
  }
  const chapters = data.chapters.reduce((sum, c) => sum + wordsOf(c, c.title, c.summary), 0)
  return { total: beats + arcs + chapters, beats, arcs, chapters, byArc }
}

/** The day `n` days before `day` (YYYY-MM-DD), counting in local calendar days. */
export function daysBefore(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d - n)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** A day's words: those added, and those cut, counted apart. */
export interface WordTally {
  added: number
  cut: number
}

/** What a change did to the words. */
export interface WordChange {
  /** New words. */
  added: number
  /** Words taken out. */
  cut: number
  /** Words cut before, back again (an undo, or cut text pasted somewhere else). */
  uncut?: number
  /** Words written before, undone. */
  unwritten?: number
}

/**
 * A day's tally after a change. Words written add to what was written that
 * day and words cut to what was cut: cutting never takes away from writing.
 * Taking something back does: undone writing comes off the words added, and
 * cut words brought back off the words cut (beyond that day's, it counts the
 * other way: undoing yesterday's words cuts them today).
 */
export function tally(day: WordTally, change: WordChange): WordTally {
  let added = day.added + change.added - (change.unwritten ?? 0)
  let cut = day.cut + change.cut - (change.uncut ?? 0)
  if (added < 0) {
    cut -= added
    added = 0
  }
  if (cut < 0) {
    added -= cut
    cut = 0
  }
  return { added, cut }
}

/** A change in a word count, as words added (or taken back, undoing) or cut. */
export function netChange(change: number, undo = false): WordChange {
  if (undo) return change > 0 ? { added: 0, cut: 0, uncut: change } : { added: 0, cut: 0, unwritten: -change }
  return change > 0 ? { added: change, cut: 0 } : { added: 0, cut: -change }
}

/** The last `count` days up to and including `today`, oldest first, with the words added and cut on each. */
export function recentDays(
  log: StoryData['wordLog'],
  cuts: StoryData['wordCuts'],
  today: string,
  count: number,
): ({ day: string } & WordTally)[] {
  return Array.from({ length: count }, (_, i) => {
    const day = daysBefore(today, count - 1 - i)
    return { day, added: log[day] ?? 0, cut: cuts[day] ?? 0 }
  })
}

/**
 * Days in a row with some words added (or with the daily goal met, if there
 * is one), ending today, or yesterday while today hasn't been written yet.
 */
export function writingStreak(log: StoryData['wordLog'], today: string, dailyGoal?: number): number {
  const counts = (day: string) => (log[day] ?? 0) >= (dailyGoal ?? 1)
  let day = counts(today) ? today : daysBefore(today, 1)
  let streak = 0
  while (counts(day)) {
    streak++
    day = daysBefore(day, 1)
  }
  return streak
}

/** 0–1 of the way to a target (no target: null). */
export const progressTo = (value: number, target?: number) =>
  target ? Math.max(0, Math.min(1, value / target)) : null
