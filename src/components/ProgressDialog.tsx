import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStory } from '../store/storyStore'
import { useUi, type ProgressTab } from '../store/uiStore'
import { dayKey } from '../store/storyOps'
import { manuscriptWords, outlineWords, progressTo, recentDays, writingStreak, type OutlineWords } from '../lib/progress'
import { isShelved } from '../lib/chapterStatus'
import { Modal } from './Modal'
import { MentionText } from './MentionText'
import { StatusPicker } from './StatusPicker'
import { WordsChart } from './WordsChart'

const plus = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : '0')
/** What a day's (or week's) words added say beside them: the goal, and what was cut, counted apart. */
const addedNote = (cut: number, goal?: string) => [goal ?? 'words added', cut ? `${cut.toLocaleString()} cut` : ''].filter(Boolean).join(' · ')

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

const TABS: { tab: ProgressTab; label: string }[] = [
  { tab: 'manuscript', label: 'Manuscript' },
  { tab: 'outline', label: 'Outline' },
]

/**
 * Word counts, kept apart: the manuscript's (with goals for the draft and
 * each day, and every chapter's target), and the outline's.
 */
export function ProgressDialog() {
  const setOpen = useUi((s) => s.setProgressOpen)
  const picked = useUi((s) => s.progressTab)
  const setTab = useUi((s) => s.setProgressTab)
  const texts = useStory((s) => s.texts)
  const chapters = useStory((s) => s.chapters)
  const arcs = useStory((s) => s.arcs)
  const beats = useStory((s) => s.beats)
  const outline = useMemo(() => outlineWords({ beats, arcs, chapters }), [beats, arcs, chapters])
  const close = () => setOpen(false)
  const { total, shelved } = manuscriptWords({ chapters, texts })
  // Until one is picked: the outline, while that's all there is (shelved chapters' words count as a manuscript).
  const tab = picked ?? (!total && !shelved && outline.total ? 'outline' : 'manuscript')
  const counts: Record<ProgressTab, number> = { manuscript: total, outline: outline.total }

  return (
    <Modal title="Progress" onClose={close} variant="wide">
      <div className="progress-top">
        <h2 className="confirm-title">Progress</h2>
        <div className="mode-switch" role="tablist" aria-label="Word count">
          {TABS.map((t) => (
            <button
              key={t.tab}
              role="tab"
              aria-selected={tab === t.tab}
              className={`mode-tab${tab === t.tab ? ' active' : ''}`}
              onClick={() => setTab(t.tab)}
            >
              {t.label}
              <span className="mode-count">{counts[t.tab].toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>
      {tab === 'manuscript' ? (
        <ManuscriptProgress total={total} shelved={shelved} close={close} />
      ) : (
        <OutlineProgress outline={outline} close={close} />
      )}
    </Modal>
  )
}

/** The manuscript's words: today's and lately, goals, and each chapter's (shelved ones apart). */
function ManuscriptProgress({ total, shelved, close }: { total: number; shelved: number; close: () => void }) {
  const texts = useStory((s) => s.texts)
  const chapters = useStory((s) => s.chapters)
  const goals = useStory((s) => s.goals)
  const log = useStory((s) => s.wordLog)
  const cuts = useStory((s) => s.wordCuts)
  const setGoals = useStory((s) => s.setGoals)
  const updateChapter = useStory((s) => s.updateChapter)

  const today = dayKey()
  const days = recentDays(log, cuts, today, 30)
  // The daily goal is words added: cutting never takes away from it.
  const todayWords = log[today] ?? 0
  const week = days.slice(-7)
  const weekAdded = week.reduce((n, d) => n + d.added, 0)
  const weekCut = week.reduce((n, d) => n + d.cut, 0)
  const streak = writingStreak(log, today, goals.daily)
  const draftProgress = progressTo(total, goals.draft)
  const dayProgress = progressTo(todayWords, goals.daily)

  return (
    <>
      <div className="stat-row">
        <Stat
          label="Manuscript"
          value={total.toLocaleString()}
          note={[
            goals.draft ? `${Math.round((draftProgress ?? 0) * 100)}% of ${goals.draft.toLocaleString()}` : 'words',
            shelved ? `${shelved.toLocaleString()} shelved` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        <Stat
          label="Today"
          value={plus(todayWords)}
          note={addedNote(cuts[today] ?? 0, goals.daily ? `of ${goals.daily.toLocaleString()} a day` : undefined)}
        />
        <Stat label="Last 7 days" value={plus(weekAdded)} note={addedNote(weekCut)} />
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
                : `${(goals.daily - todayWords).toLocaleString()} to go today`
              : 'words added a day'}
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
                <tr key={c.id} className={isShelved(c) ? 'shelved' : undefined}>
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
    </>
  )
}

/** The outline's words, counted apart from the manuscript: in all, today and lately, and arc by arc. */
function OutlineProgress({ outline, close }: { outline: OutlineWords; close: () => void }) {
  const arcs = useStory((s) => s.arcs)
  const chapters = useStory((s) => s.chapters)
  const log = useStory((s) => s.outlineLog)
  const cuts = useStory((s) => s.outlineCuts)

  const today = dayKey()
  const days = recentDays(log, cuts, today, 30)
  const week = days.slice(-7)
  const streak = writingStreak(log, today)

  return (
    <>
      <div className="stat-row">
        <Stat label="Outline" value={outline.total.toLocaleString()} note="words" />
        <Stat label="Today" value={plus(log[today] ?? 0)} note={addedNote(cuts[today] ?? 0)} />
        <Stat
          label="Last 7 days"
          value={plus(week.reduce((n, d) => n + d.added, 0))}
          note={addedNote(week.reduce((n, d) => n + d.cut, 0))}
        />
        <Stat label="Streak" value={`${streak} day${streak === 1 ? '' : 's'}`} note="adding to it every day" />
      </div>
      <p className="progress-note">
        Everything written in beats (titles and descriptions), arcs (names and descriptions), and chapters’ titles and summaries,
        counted apart from the manuscript.
      </p>

      <WordsChart days={days} what="Outline words added and cut" />

      <h3 className="progress-heading">By arc</h3>
      <div className="progress-table-wrap">
        <table className="progress-table">
          <thead>
            <tr>
              <th scope="col">Arc</th>
              <th scope="col" className="num">
                Beats
              </th>
              <th scope="col" className="num">
                Words
              </th>
            </tr>
          </thead>
          <tbody>
            {arcs.map((arc) => (
              <tr key={arc.id}>
                <td>
                  <Link to={`/arcs/${arc.id}`} className="progress-chapter" onClick={close}>
                    <span className="arc-dot" style={{ '--arc': arc.color } as React.CSSProperties} aria-hidden />
                    <span className="progress-title">
                      <MentionText text={arc.name} fallback={<span className="muted">Untitled arc</span>} />
                    </span>
                  </Link>
                </td>
                <td className="num">{arc.beatIds.length.toLocaleString()}</td>
                <td className="num">{(outline.byArc[arc.id] ?? 0).toLocaleString()}</td>
              </tr>
            ))}
            <tr>
              <td>
                <span className="progress-chapter static">
                  <span className="progress-title">Chapter titles and summaries</span>
                </span>
              </td>
              <td className="num muted">{chapters.length ? `${chapters.length} chapter${chapters.length === 1 ? '' : 's'}` : ''}</td>
              <td className="num">{outline.chapters.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}
