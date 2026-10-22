import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { SprintRecord } from '../types'
import { useStory } from './storyStore'
import { dayKey } from './storyOps'
import { finishSprint, pause, remainingMs, resume, sprintWords, startSprint, type RunningSprint } from '../lib/sprints'

// The writing sprint under way on this device (it carries on through a
// reload), and the one just finished, for its result. Finished sprints are
// kept with the story.

interface SprintState {
  running: RunningSprint | null
  /** The sprint just over, until its result is put away. */
  finished: SprintRecord | null
  /** It finished by running out of time (not stopped). */
  timeUp: boolean
  /** A chime when the time is up. */
  sound: boolean
  lastMinutes: number
  lastGoal: number | null
  start: (minutes: number, goal?: number) => void
  pause: () => void
  resume: () => void
  /** Ends it: early (stopped), or because the time is up. */
  finish: (timeUp: boolean) => void
  dismiss: () => void
  setSound: (sound: boolean) => void
}

let audio: AudioContext | null = null

/** Two soft notes, rising. */
function chime() {
  try {
    if (!audio) return
    const at = audio.currentTime
    for (const [i, freq] of [660, 880].entries()) {
      const tone = audio.createOscillator()
      const gain = audio.createGain()
      tone.type = 'sine'
      tone.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, at + i * 0.22)
      gain.gain.exponentialRampToValueAtTime(0.18, at + i * 0.22 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + i * 0.22 + 0.9)
      tone.connect(gain).connect(audio.destination)
      tone.start(at + i * 0.22)
      tone.stop(at + i * 0.22 + 1)
    }
  } catch {
    // No sound, then.
  }
}

/** Sound can only start from a click, so the sprint's start readies it. */
function readySound() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
  } catch {
    audio = null
  }
}

export const useSprint = create<SprintState>()(
  persist(
    (set, get) => ({
      running: null,
      finished: null,
      timeUp: false,
      sound: true,
      lastMinutes: 25,
      lastGoal: null,
      start: (minutes, goal) => {
        if (get().sound) readySound()
        const running = startSprint(minutes, goal, useStory.getState().wordLog, dayKey(), Date.now())
        set({ running, finished: null, lastMinutes: running.minutes, lastGoal: running.goal ?? null })
      },
      pause: () => set((s) => (s.running ? { running: pause(s.running, Date.now()) } : s)),
      resume: () => set((s) => (s.running ? { running: resume(s.running, Date.now()) } : s)),
      finish: (timeUp) => {
        const { running, sound } = get()
        if (!running) return
        const now = Date.now()
        const record = finishSprint(running, sprintWords(running, useStory.getState().wordLog), now)
        if (record) useStory.getState().addSprint(record)
        set({ running: null, finished: record, timeUp })
        if (timeUp && sound) chime()
      },
      dismiss: () => set({ finished: null }),
      setSound: (sound) => set({ sound }),
    }),
    {
      name: 'story-builder:sprint',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ running: s.running, sound: s.sound, lastMinutes: s.lastMinutes, lastGoal: s.lastGoal }),
    },
  ),
)

/** Time left in the sprint now (0 when there's none). */
export const sprintLeft = (s: RunningSprint | null) => (s ? remainingMs(s, Date.now()) : 0)
