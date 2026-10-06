import type { StoryData } from '../types'

// Word counts and goals, worked out from the story's texts and word logs.

export const totalWords = (texts: StoryData['texts']) =>
  Object.values(texts).reduce((n, t) => n + (t.words || 0), 0)

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

/** The last `count` days up to and including `today`, oldest first, with the words written on each. */
export function recentDays(log: StoryData['wordLog'], today: string, count: number): { day: string; words: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const day = daysBefore(today, count - 1 - i)
    return { day, words: log[day] ?? 0 }
  })
}

/**
 * Days in a row with some writing (or with the daily goal met, if there is
 * one), ending today, or yesterday while today hasn't been written yet.
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
