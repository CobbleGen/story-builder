import { describe, expect, it } from 'vitest'
import { bestSprint, clock, elapsedMs, finishSprint, pause, perMinute, remainingMs, resume, sprintWords, startSprint } from './sprints'
import { addSprint, emptyStory, normalizeStory } from '../store/storyOps'

const MIN = 60_000

describe('writing sprints', () => {
  it('time the sprint, pauses left out', () => {
    let s = startSprint(25, 500, { '2026-10-22': 300 }, '2026-10-22', 0)
    expect(s).toMatchObject({ minutes: 25, goal: 500, baseAdded: 300 })
    expect(remainingMs(s, 10 * MIN)).toBe(15 * MIN)
    s = pause(s, 10 * MIN)
    // Paused for five minutes: no time passes
    expect(remainingMs(s, 15 * MIN)).toBe(15 * MIN)
    s = resume(s, 15 * MIN)
    expect(elapsedMs(s, 20 * MIN)).toBe(15 * MIN)
    expect(remainingMs(s, 40 * MIN)).toBe(0)
    // Lengths kept sensible, and no goal of nothing
    expect(startSprint(0, 0, {}, '2026-10-22', 0)).toMatchObject({ minutes: 1 })
    expect(startSprint(999, undefined, {}, '2026-10-22', 0).minutes).toBe(240)
    expect(startSprint(10, 0, {}, '2026-10-22', 0)).not.toHaveProperty('goal')
  })

  it('count the words added since it started, across midnight too', () => {
    const s = startSprint(30, undefined, { '2026-10-21': 900, '2026-10-22': 120 }, '2026-10-22', 0)
    expect(sprintWords(s, { '2026-10-21': 900, '2026-10-22': 420 })).toBe(300)
    expect(sprintWords(s, { '2026-10-22': 500, '2026-10-23': 80 })).toBe(460)
    // Undoing older words never makes it less than nothing
    expect(sprintWords(s, { '2026-10-22': 20 })).toBe(0)
  })

  it('are kept once over, unless they ran under a minute', () => {
    const s = startSprint(25, 500, {}, '2026-10-22', 1000)
    expect(finishSprint(s, 612, 1000 + 25 * MIN + 5000)).toEqual({ at: 1000, minutes: 25, seconds: 1500, words: 612, goal: 500 })
    expect(finishSprint(s, 40, 1000 + 7 * MIN)).toMatchObject({ seconds: 420, words: 40 })
    expect(finishSprint(s, 0, 1000 + 20_000)).toBeNull()
    expect(finishSprint(s, 3, 1000 + 20_000)).toBeNull()
    expect(finishSprint(s, 3, 1000 + MIN)).toMatchObject({ seconds: 60, words: 3 })
  })

  it('read as clocks and paces', () => {
    expect(clock(25 * MIN)).toBe('25:00')
    expect(clock(61_500)).toBe('1:02')
    expect(clock(0)).toBe('0:00')
    expect(clock(65 * MIN)).toBe('1:05:00')
    expect(perMinute(612, 1500)).toBe('24')
    expect(perMinute(40, 600)).toBe('4')
    expect(perMinute(45, 600)).toBe('4.5')
    expect(perMinute(5, 0)).toBe('0')
    expect(bestSprint([])).toBeNull()
    expect(bestSprint([{ at: 1, minutes: 10, seconds: 600, words: 200 }, { at: 2, minutes: 25, seconds: 1500, words: 650 }])?.at).toBe(2)
  })

  it('are kept with the story, checked on loading', () => {
    let data = addSprint(emptyStory(), { at: 5, minutes: 25, seconds: 1500, words: 612, goal: 500 })
    data = addSprint(data, { at: 9, minutes: 10, seconds: -3, words: 1 })
    expect(data.sprints).toEqual([{ at: 5, minutes: 25, seconds: 1500, words: 612, goal: 500 }])
    const loaded = normalizeStory({ ...data, sprints: [{ at: 7, minutes: 10, seconds: 600.4, words: 80 }, 'x', { at: 3, minutes: 0, seconds: 1, words: 1 }, ...data.sprints] })
    expect(loaded.sprints.map((s) => s.at)).toEqual([5, 7])
    expect(loaded.sprints[1].seconds).toBe(600)
    expect(normalizeStory({ title: 'Old' }).sprints).toEqual([])
  })
})
