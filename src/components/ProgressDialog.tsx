import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { dayKey } from '../store/storyOps'
import { progressTo, recentDays, totalWords, writingStreak } from '../lib/progress'
import { Modal } from './Modal'
import { MentionText } from './MentionText'
import { StatusPicker } from './StatusPicker'
import { WordsChart } from './WordsChart'

const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n < 0 ? `−${Math.abs(n).toLocaleString()}` : '0')

/** A word target to type in: empty for none. Saved on Enter or when leaving the field. */
function TargetInput({ value, onChange, label, placeholder = 'None' }: { value?: number; onChange: (v: number) => void; label: string; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    onChange(Number(draft.replace(/[^\d]/g, '')) || 0)
    setDraft(null)
  }
  return (
    <input
      className="target-input"
      inputMode="numeric"
      aria-label={label}
      placeholder={placeholder}
      value={draft ?? (value ? value.toLocaleString() : '')}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setDraft(value ? String(value) : '')
        requestAnimationFrame(() => e.target.select())
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/** A thin bar showing how far along a goal is; the track is a pale step of the same colour. */
function Meter({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="meter empty" aria-hidden />
  return (
    <span className={`meter${value >= 1 ? ' done' : ''}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <span className="meter-fill" style={{ width: `${value * 100}%` }} />
    </span>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  )
}

/** Word counts for the manuscript, goals for the draft and each day, and every chapter's target. */
export function ProgressDialog() {
  const setOpen = useUi((s) => s.setProgressOpen)
  const texts = useStory((s) => s.texts)
  const chapters = useStory((s) => s.chapters)
  const goals = useStory((s) => s.goals)
  const log = useStory((s) => s.wordLog)
  const setGoals = useStory((s) => s.setGoals)
  const updateChapter = useStory((s) => s.updateChapter)
  const close = () => setOpen(false)

  const today = dayKey()
  const total = totalWords(texts)
  const days = recentDays(log, today, 30)
  const todayWords = log[today] ?? 0
  const week = days.slice(-7).reduce((n, d) => n + d.words, 0)
  const streak = writingStreak(log, today, goals.daily)
  const draftProgress = progressTo(total, goals.draft)
  const dayProgress = progressTo(Math.max(0, todayWords), goals.daily)

  return (
    <Modal title="Progress" onClose={close} variant="wide">
      <h2 className="confirm-title">Progress</h2>
      <div className="stat-row">
        <Stat
          label="Manuscript"
          value={total.toLocaleString()}
          note={goals.draft ? `${Math.round((draftProgress ?? 0) * 100)}% of ${goals.draft.toLocaleString()}` : 'words'}
        />
        <Stat label="Today" value={signed(todayWords)} note={goals.daily ? `of ${goals.daily.toLocaleString()} a day` : 'words'} />
        <Stat label="Last 7 days" value={signed(week)} note="words" />
        <Stat label="Streak" value={`${streak} day${streak === 1 ? '' : 's'}`} note={goals.daily ? 'meeting the daily goal' : 'writing every day'} />
      </div>

      <div className="goal-rows">
        <label className="goal-row">
          <span className="goal-name">Draft goal</span>
          <TargetInput value={goals.draft} onChange={(draft) => setGoals({ draft })} label="Draft goal in words" placeholder="e.g. 80,000" />
          <Meter value={draftProgress} label="Draft goal progress" />
          <span className="goal-left">
            {goals.draft ? (total >= goals.draft ? 'Reached' : `${(goals.draft - total).toLocaleString()} to go`) : 'words in the whole book'}
          </span>
        </label>
        <label className="goal-row">
          <span className="goal-name">Daily goal</span>
          <TargetInput value={goals.daily} onChange={(daily) => setGoals({ daily })} label="Daily goal in words" placeholder="e.g. 500" />
          <Meter value={dayProgress} label="Today’s progress" />
          <span className="goal-left">
            {goals.daily
              ? todayWords >= goals.daily
                ? 'Done for today'
                : `${(goals.daily - Math.max(0, todayWords)).toLocaleString()} to go today`
              : 'words a day'}
          </span>
        </label>
      </div>

      <WordsChart days={days} goal={goals.daily} />

      <h3 className="progress-heading">Chapters</h3>
      <div className="progress-table-wrap">
        <table className="progress-table">
          <thead>
            <tr>
              <th scope="col">Chapter</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">
                Words
              </th>
              <th scope="col" className="num">
                Target
              </th>
              <th scope="col">
                <span className="visually-hidden">Progress</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {chapters.map((c, i) => {
              const words = texts[c.id]?.words ?? 0
              return (
                <tr key={c.id}>
                  <td>
                    <Link to={`/write/${c.id}`} className="progress-chapter" onClick={close}>
                      <span className="progress-num">{i + 1}</span>
                      <span className="progress-title">
                        <MentionText text={c.title} fallback={<span className="muted">Untitled chapter</span>} />
                      </span>
                    </Link>
                  </td>
                  <td>
                    <StatusPicker chapter={c} />
                  </td>
                  <td className="num">{words.toLocaleString()}</td>
                  <td className="num">
                    <TargetInput
                      value={c.targetWords}
                      onChange={(targetWords) => updateChapter(c.id, { targetWords })}
                      label={`Word target for chapter ${i + 1}`}
                    />
                  </td>
                  <td>
                    <Meter value={progressTo(words, c.targetWords)} label={`Chapter ${i + 1} progress`} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
