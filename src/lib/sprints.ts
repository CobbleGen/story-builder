import type { SprintRecord, StoryData } from '../types'

// Writing sprints: a timer for a burst of writing, counting the words added
// to the manuscript while it runs.

/** The lengths offered, in minutes. */
export const SPRINT_LENGTHS = [10, 15, 25, 30, 45, 60]
export const MAX_SPRINT_MINUTES = 240

/** A sprint under way. */
export interface RunningSprint {
  startedAt: number
  minutes: number
  goal?: number
  /** When it was paused, while it is. */
  pausedAt: number | null
  /** Time spent paused before now. */
  pausedMs: number
  /** The day it started and the words added that day by then: what it counts from. */
  baseDay: string
  baseAdded: number
}

export function startSprint(minutes: number, goal: number | undefined, log: StoryData['wordLog'], day: string, now: number): RunningSprint {
  return {
    startedAt: now,
    minutes: Math.max(1, Math.min(MAX_SPRINT_MINUTES, Math.round(minutes))),
    ...(goal && goal > 0 ? { goal: Math.round(goal) } : {}),
    pausedAt: null,
    pausedMs: 0,
    baseDay: day,
    baseAdded: log[day] ?? 0,
  }
}

/** How long it has run, pauses left out. */
export const elapsedMs = (s: RunningSprint, now: number) => Math.max(0, (s.pausedAt ?? now) - s.startedAt - s.pausedMs)

export const remainingMs = (s: RunningSprint, now: number) => Math.max(0, s.minutes * 60_000 - elapsedMs(s, now))

export const pause = (s: RunningSprint, now: number): RunningSprint => (s.pausedAt ? s : { ...s, pausedAt: now })

export const resume = (s: RunningSprint, now: number): RunningSprint =>
  s.pausedAt ? { ...s, pausedAt: null, pausedMs: s.pausedMs + (now - s.pausedAt) } : s

/** Words added to the manuscript since it started (from the day's tallies, so across midnight too). */
export function sprintWords(s: RunningSprint, log: StoryData['wordLog']): number {
  let words = -s.baseAdded
  for (const [day, added] of Object.entries(log)) if (day >= s.baseDay) words += added
  return Math.max(0, words)
}

/** The sprint as kept once it's over, or null if it ran under a minute (too short to say much). */
export function finishSprint(s: RunningSprint, words: number, now: number): SprintRecord | null {
  const seconds = Math.round(Math.min(elapsedMs(s, now), s.minutes * 60_000) / 1000)
  if (seconds < 60) return null
  return { at: s.startedAt, minutes: s.minutes, seconds, words, ...(s.goal ? { goal: s.goal } : {}) }
}

/** "4:05", or "1:04:05" from an hour. */
export function clock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Words a minute, to one place where it's small. */
export function perMinute(words: number, seconds: number): string {
  if (!seconds) return '0'
  const rate = (words * 60) / seconds
  return rate < 10 ? (Math.round(rate * 10) / 10).toLocaleString() : Math.round(rate).toLocaleString()
}

/** The sprint with the most words. */
export function bestSprint(sprints: SprintRecord[]): SprintRecord | null {
  let best: SprintRecord | null = null
  for (const s of sprints) if (!best || s.words > best.words) best = s
  return best
}
