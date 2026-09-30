import type { StoryData } from '../types'

// Word counts and goals, worked out from the story's texts and word log.

export const totalWords = (texts: StoryData['texts']) =>
  Object.values(texts).reduce((n, t) => n + (t.words || 0), 0)

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
