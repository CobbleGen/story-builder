import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Pause, Play, RotateCcw, Square, Timer } from 'lucide-react'
import type { SprintRecord } from '../types'
import { useStory } from '../store/storyStore'
import { useSprint } from '../store/sprintStore'
import { MAX_SPRINT_MINUTES, SPRINT_LENGTHS, bestSprint, clock, perMinute, remainingMs, sprintWords } from '../lib/sprints'
import { Modal } from './Modal'

// Writing sprints on screen: the button that sets one going (in the
// manuscript's toolbar), the pill that shows it running (wherever you are),
// and its result.

const words = (n: number) => `${n.toLocaleString()} word${n === 1 ? '' : 's'}`
const minutesOf = (seconds: number) => {
  const m = Math.round(seconds / 60)
  return m < 1 ? `${seconds} seconds` : `${m} minute${m === 1 ? '' : 's'}`
}

/** The time now, every second while `ticking`. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [ticking])
  return now
}

/** The sprint button: set a length and a goal and go; while one runs, its time left (and its controls). */
export function SprintButton() {
  const running = useSprint((s) => s.running)
  const [open, setOpen] = useState(false)
  const now = useNow(!!running && !running.pausedAt)
  const anchor = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="sprint-anchor" ref={anchor}>
      <button
        type="button"
        className={`tool-btn sprint-btn${running ? ' running' : ''}${open ? ' active' : ''}`}
        aria-expanded={open}
        aria-label={running ? `Writing sprint: ${clock(remainingMs(running, now))} left` : 'Writing sprint'}
        title={running ? 'The sprint under way' : 'Writing sprint: write for a set time, counting the words you add'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((was) => !was)}
      >
        <Timer size={17} />
        {running && <span className="sprint-btn-time">{clock(remainingMs(running, now))}</span>}
      </button>
      {open && (running ? <SprintControls onDone={() => setOpen(false)} /> : <SprintSetup onStart={() => setOpen(false)} />)}
    </span>
  )
}

/** Choosing a sprint: how long, and (if you like) how many words. */
function SprintSetup({ onStart }: { onStart: () => void }) {
  const lastMinutes = useSprint((s) => s.lastMinutes)
  const lastGoal = useSprint((s) => s.lastGoal)
  const sound = useSprint((s) => s.sound)
  const setSound = useSprint((s) => s.setSound)
  const start = useSprint((s) => s.start)
  const last = useStory((s) => s.sprints[s.sprints.length - 1])
  const [minutes, setMinutes] = useState(lastMinutes)
  const [goal, setGoal] = useState(lastGoal ? String(lastGoal) : '')
  const go = () => {
    start(minutes, Number(goal.replace(/[^\d]/g, '')) || undefined)
    onStart()
  }
  return (
    <div className="sprint-pop" role="dialog" aria-label="Writing sprint">
      <strong className="sprint-pop-title">Writing sprint</strong>
      <p className="sprint-pop-note">Write for a set time. The words you add to the manuscript are counted.</p>
      <div className="sprint-lengths" role="radiogroup" aria-label="Minutes">
        {SPRINT_LENGTHS.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={minutes === m} className={`sprint-length${minutes === m ? ' chosen' : ''}`} onClick={() => setMinutes(m)}>
            {m}
          </button>
        ))}
        <label className="sprint-minutes">
          <input
            type="number"
            min={1}
            max={MAX_SPRINT_MINUTES}
            value={minutes}
            onChange={(e) => setMinutes(Math.max(1, Math.min(MAX_SPRINT_MINUTES, Math.round(Number(e.target.value)) || 1)))}
            aria-label="Minutes"
          />
          min
        </label>
      </div>
      <label className="sprint-goal">
        <span>Word goal</span>
        <input
          inputMode="numeric"
          placeholder="Optional"
          value={goal}
          onChange={(e) => setGoal(e.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          aria-label="Word goal for the sprint"
        />
      </label>
      <label className="sprint-sound">
        <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
        <span>Chime when the time is up</span>
      </label>
      <button type="button" className="btn primary sprint-start" onClick={go}>
        <Play size={15} /> Start a {minutes}-minute sprint
      </button>
      {last && (
        <span className="sprint-pop-last">
          Last: {words(last.words)} in {minutesOf(last.seconds)}
        </span>
      )}
    </div>
  )
}

/** The sprint under way, from its button: pause, carry on, or stop. */
function SprintControls({ onDone }: { onDone: () => void }) {
  const running = useSprint((s) => s.running)
  const pause = useSprint((s) => s.pause)
  const resume = useSprint((s) => s.resume)
  const finish = useSprint((s) => s.finish)
  if (!running) return null
  return (
    <div className="sprint-pop" role="dialog" aria-label="Writing sprint">
      <strong className="sprint-pop-title">{running.pausedAt ? 'Sprint paused' : 'Sprint under way'}</strong>
      <div className="sprint-pop-row">
        <button type="button" className="btn ghost small" onClick={running.pausedAt ? resume : pause}>
          {running.pausedAt ? <Play size={14} /> : <Pause size={14} />} {running.pausedAt ? 'Carry on' : 'Pause'}
        </button>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            finish(false)
            onDone()
          }}
        >
          <Square size={14} /> Stop
        </button>
      </div>
    </div>
  )
}

/** The sprint running, wherever you are: time left, words so far, pause and stop; at the end, its result. */
export function SprintPill() {
  const running = useSprint((s) => s.running)
  const pause = useSprint((s) => s.pause)
  const resume = useSprint((s) => s.resume)
  const finish = useSprint((s) => s.finish)
  const log = useStory((s) => s.wordLog)
  const now = useNow(!!running && !running.pausedAt)
  const { pathname } = useLocation()
  const left = running ? remainingMs(running, now) : 0
  useEffect(() => {
    if (running && !running.pausedAt && left <= 0) finish(true)
  }, [running, left, finish])
  if (!running) return null
  const written = sprintWords(running, log)
  const done = 1 - left / (running.minutes * 60_000)
  const paused = !!running.pausedAt
  return (
    <div className={`sprint-pill${pathname.startsWith('/write') ? ' on-write' : ''}${paused ? ' paused' : ''}`} role="group" aria-label="Writing sprint">
      <Timer size={15} aria-hidden />
      <span className="sprint-clock" title={paused ? 'Paused' : 'Time left'}>
        {clock(left)}
      </span>
      <span className="sprint-words">
        {words(written)}
        {running.goal ? <span className="muted"> of {running.goal.toLocaleString()}</span> : null}
      </span>
      <button type="button" className="sprint-pill-btn" onClick={paused ? resume : pause} aria-label={paused ? 'Carry on' : 'Pause'} title={paused ? 'Carry on' : 'Pause'}>
        {paused ? <Play size={14} /> : <Pause size={14} />}
      </button>
      <button type="button" className="sprint-pill-btn" onClick={() => finish(false)} aria-label="Stop the sprint" title="Stop the sprint">
        <Square size={13} />
      </button>
      <span className="sprint-bar" style={{ width: `${Math.min(100, done * 100)}%` }} aria-hidden />
    </div>
  )
}

/** The sprint just over: words, pace, and the goal. */
export function SprintDone() {
  const finished = useSprint((s) => s.finished)
  const timeUp = useSprint((s) => s.timeUp)
  const dismiss = useSprint((s) => s.dismiss)
  const start = useSprint((s) => s.start)
  if (!finished) return null
  return (
    <Modal
      title={timeUp ? 'Sprint done' : 'Sprint stopped'}
      onClose={dismiss}
      footer={
        <>
          <button className="btn ghost" onClick={dismiss}>
            Done
          </button>
          <button
            className="btn primary"
            onClick={() => {
              dismiss()
              start(finished.minutes, finished.goal)
            }}
          >
            <RotateCcw size={15} /> Another {finished.minutes}-minute sprint
          </button>
        </>
      }
    >
      <SprintResult sprint={finished} timeUp={timeUp} />
    </Modal>
  )
}

function SprintResult({ sprint, timeUp }: { sprint: SprintRecord; timeUp: boolean }) {
  const goal = sprint.goal
  return (
    <div className="sprint-result">
      <h2 className="confirm-title">{timeUp ? 'Time’s up' : 'Sprint stopped'}</h2>
      <p className="sprint-result-words">
        <strong>{sprint.words.toLocaleString()}</strong> {sprint.words === 1 ? 'word' : 'words'} added
      </p>
      <p className="sprint-result-note">
        in {minutesOf(sprint.seconds)} · {perMinute(sprint.words, sprint.seconds)} a minute
        {goal ? (sprint.words >= goal ? ` · goal of ${goal.toLocaleString()} reached` : ` · ${(goal - sprint.words).toLocaleString()} short of ${goal.toLocaleString()}`) : ''}
      </p>
    </div>
  )
}

const when = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Sprints so far, on the progress page: the latest, the pace, and the best. */
export function SprintHistory() {
  const sprints = useStory((s) => s.sprints)
  if (!sprints.length) return null
  const recent = sprints.slice(-6).reverse()
  const best = bestSprint(sprints)
  const totalWords = sprints.reduce((n, s) => n + s.words, 0)
  const totalSeconds = sprints.reduce((n, s) => n + s.seconds, 0)
  return (
    <section className="sprint-history" aria-label="Writing sprints">
      <h3 className="progress-heading">Writing sprints</h3>
      <p className="progress-note">
        {sprints.length.toLocaleString()} sprint{sprints.length === 1 ? '' : 's'} · {perMinute(totalWords, totalSeconds)} words a minute on average
        {best ? ` · best: ${words(best.words)} in ${minutesOf(best.seconds)}` : ''}
      </p>
      <div className="progress-table-wrap">
        <table className="progress-table">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col" className="num">
                Length
              </th>
              <th scope="col" className="num">
                Words
              </th>
              <th scope="col" className="num">
                A minute
              </th>
              <th scope="col">Goal</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((s) => (
              <tr key={s.at}>
                <td>{when.format(new Date(s.at))}</td>
                <td className="num">{minutesOf(s.seconds)}</td>
                <td className="num">{s.words.toLocaleString()}</td>
                <td className="num">{perMinute(s.words, s.seconds)}</td>
                <td className={s.goal && s.words >= s.goal ? 'sprint-goal-met' : 'muted'}>
                  {s.goal ? (s.words >= s.goal ? `${s.goal.toLocaleString()} ✓` : s.goal.toLocaleString()) : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
