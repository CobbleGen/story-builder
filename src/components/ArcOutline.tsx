import { useEffect, useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ArrowLeftRight, ListRestart, Signpost, X } from 'lucide-react'
import type { Arc } from '../types'
import { useMentionLookup, useStory } from '../store/storyStore'
import { OUTLINE_GROUPS, OUTLINES, outlineKind, type OutlineKind, type OutlineStep } from '../lib/outlines'
import { plainText } from '../lib/mentions'
import { Modal } from './Modal'

// A common story structure laid over an arc: chosen from a list, its steps
// shown beside the beats they fall on (on the arc's page only), moved to
// other beats by dragging them, or from their details.

/** What's dragged: a step of the arc's outline. */
export interface StepDragData {
  type: 'step'
  stepId: string
}

/** The place for steps on no beat: dropped there, a step comes off its beat. */
export const STEP_TRAY = 'outline-tray'

/** Choosing a structure to lay over the arc, each shown with its steps. */
export function OutlinePicker({ arc, onClose }: { arc: Arc; onClose: () => void }) {
  const setArcOutline = useStory((s) => s.setArcOutline)
  const current = outlineKind(arc.outline?.kind)
  const [chosen, setChosen] = useState<OutlineKind>(current ?? OUTLINES[0])
  const use = () => {
    setArcOutline(arc.id, chosen.id)
    onClose()
  }
  return (
    <Modal
      title="Arc outline"
      onClose={onClose}
      variant="wide"
      accent={arc.color}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={use} disabled={chosen.id === current?.id}>
            <Signpost size={16} /> {current ? 'Use this one instead' : 'Use this outline'}
          </button>
        </>
      }
    >
      <h2 className="confirm-title">Arc outline</h2>
      <p className="outline-intro">
        Lay a common story structure over this arc. Its steps show beside the beats they fall on, saying what should happen there; drag
        them to other beats as the arc takes shape. {arc.beatIds.length ? 'They’re spread over the beats to begin with.' : 'Add beats and drag the steps onto them.'}
      </p>
      <div className="outline-picker">
        <div className="outline-list" role="radiogroup" aria-label="Outlines">
          {OUTLINE_GROUPS.map((group) => (
            <div key={group} className="outline-group">
              <h3 className="outline-group-name">{group}</h3>
              {OUTLINES.filter((o) => o.group === group).map((o) => (
                <button
                  key={o.id}
                  role="radio"
                  aria-checked={o.id === chosen.id}
                  className={`outline-option${o.id === chosen.id ? ' chosen' : ''}`}
                  onClick={() => setChosen(o)}
                  onDoubleClick={() => {
                    setChosen(o)
                    if (o.id !== current?.id) {
                      setArcOutline(arc.id, o.id)
                      onClose()
                    }
                  }}
                >
                  <span>{o.name}</span>
                  <span className="outline-option-count">{o.steps.length}</span>
                  {o.id === current?.id && <span className="outline-option-current">In use</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="outline-preview" aria-live="polite">
          <h3 className="outline-preview-name">{chosen.name}</h3>
          <p className="outline-preview-summary">{chosen.summary}</p>
          <ol className="outline-preview-steps">
            {chosen.steps.map((s) => (
              <li key={s.id}>
                <strong>{s.name}</strong>
                <span>{s.what}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Above the beats: the arc's outline (or a button to choose one), what to
 * do with it, and its steps on no beat yet, where a step dropped comes off
 * its beat.
 */
export function OutlineBar({ arc, dragging }: { arc: Arc; dragging: boolean }) {
  const setArcOutline = useStory((s) => s.setArcOutline)
  const spreadArcOutline = useStory((s) => s.spreadArcOutline)
  const [picking, setPicking] = useState(false)
  const outline = outlineKind(arc.outline?.kind)
  // Only while a step is dragged (a beat moved with the keyboard mustn't stop there).
  const { setNodeRef, isOver } = useDroppable({ id: STEP_TRAY, data: { type: 'tray' }, disabled: !outline || !dragging })
  const picker = picking && <OutlinePicker arc={arc} onClose={() => setPicking(false)} />
  if (!outline) {
    return (
      <div className="outline-bar off">
        <button className="btn ghost small" onClick={() => setPicking(true)} title="Lay a common story structure over this arc">
          <Signpost size={15} /> Arc outline
        </button>
        <span className="outline-bar-hint">Optional: a common story structure, its steps beside the beats.</span>
        {picker}
      </div>
    )
  }
  const loose = outline.steps.filter((s) => !arc.outline!.steps[s.id])
  return (
    <div className="outline-bar">
      <div className="outline-bar-head">
        <Signpost size={16} className="outline-bar-icon" aria-hidden />
        <span className="outline-bar-name">{outline.name}</span>
        <span className="outline-bar-count">
          {outline.steps.length} steps{loose.length ? `, ${loose.length} on no beat yet` : ''}
        </span>
        <span className="outline-bar-actions">
          <button
            className="btn ghost small"
            onClick={() => spreadArcOutline(arc.id)}
            disabled={!arc.beatIds.length}
            title="Spread the steps over the beats again, by where each falls in the arc"
          >
            <ListRestart size={14} /> Spread out
          </button>
          <button className="btn ghost small" onClick={() => setPicking(true)} title="Choose another outline">
            <ArrowLeftRight size={14} /> Change
          </button>
          <button className="btn ghost small" onClick={() => setArcOutline(arc.id, null)} title="Take the outline off this arc">
            <X size={14} /> Remove
          </button>
        </span>
      </div>
      <div ref={setNodeRef} className={`outline-tray${isOver ? ' over' : ''}${dragging ? ' open' : ''}`}>
        {loose.length > 0 && <span className="outline-tray-label">On no beat yet</span>}
        {loose.map((s) => (
          <OutlineMark key={s.id} arc={arc} outline={outline} step={s} />
        ))}
        {!loose.length && (
          <span className="outline-tray-hint">
            {arc.beatIds.length ? 'Every step is on a beat. Drop one here to take it off.' : 'Add beats, then drag the steps onto them.'}
          </span>
        )}
      </div>
      {picker}
    </div>
  )
}

/** The steps on a beat, beside it. */
export function OutlineMarks({ arc, beatId }: { arc: Arc; beatId: string }) {
  const outline = outlineKind(arc.outline?.kind)
  if (!outline) return null
  const steps = outline.steps.filter((s) => arc.outline!.steps[s.id] === beatId)
  return (
    <div className="outline-marks">
      {steps.map((s) => (
        <OutlineMark key={s.id} arc={arc} outline={outline} step={s} />
      ))}
    </div>
  )
}

/** A step: its number, name and what should happen, as shown (and while dragged). */
export function OutlineMarkView({ outline, step, overlay }: { outline: OutlineKind; step: OutlineStep; overlay?: boolean }) {
  return (
    <span className={`outline-mark-face${overlay ? ' overlay' : ''}`}>
      <span className="outline-mark-number">{outline.steps.indexOf(step) + 1}</span>
      <span className="outline-mark-text">
        <span className="outline-mark-name">{step.name}</span>
        <span className="outline-mark-what">{step.what}</span>
      </span>
    </span>
  )
}

/** A step of the outline, dragged to another beat (or off them all), or opened to read it and choose its beat. */
function OutlineMark({ arc, outline, step }: { arc: Arc; outline: OutlineKind; step: OutlineStep }) {
  const data: StepDragData = { type: 'step', stepId: step.id }
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `step:${step.id}`, data })
  const [open, setOpen] = useState(false)
  // By the mouse or a finger; with the keyboard, its details choose the beat.
  const { onKeyDown: _keys, ...pointer } = listeners ?? {}
  void _keys
  return (
    <span className={`outline-mark${isDragging ? ' dragging' : ''}${open ? ' open' : ''}`}>
      <button
        ref={setNodeRef}
        className="outline-mark-btn"
        {...pointer}
        aria-roledescription={attributes['aria-roledescription']}
        aria-describedby={attributes['aria-describedby']}
        aria-expanded={open}
        aria-label={`Outline step ${outline.steps.indexOf(step) + 1}: ${step.name}. ${step.what}`}
        title={`${step.what}\n\nDrag it to another beat, or click for more.`}
        onClick={() => setOpen((was) => !was)}
      >
        <OutlineMarkView outline={outline} step={step} />
      </button>
      {open && <StepDetails arc={arc} outline={outline} step={step} onClose={() => setOpen(false)} />}
    </span>
  )
}

/** A step's details: what should happen there, and the beat it's on. */
function StepDetails({ arc, outline, step, onClose }: { arc: Arc; outline: OutlineKind; step: OutlineStep; onClose: () => void }) {
  const beats = useStory((s) => s.beats)
  const placeOutlineStep = useStory((s) => s.placeOutlineStep)
  const lookup = useMentionLookup()
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    // Its own step toggles it, so that doesn't count as elsewhere.
    const mark = ref.current?.parentElement
    const onDown = (e: PointerEvent) => {
      if (!mark?.contains(e.target as Node)) close.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal')) close.current()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
  const number = outline.steps.indexOf(step) + 1
  return (
    <div ref={ref} className="outline-step-pop" role="dialog" aria-label={step.name}>
      <span className="outline-step-pop-of">
        Step {number} of {outline.steps.length} · {outline.name}
      </span>
      <strong className="outline-step-pop-name">{step.name}</strong>
      <p className="outline-step-pop-what">{step.what}</p>
      <label className="outline-step-pop-beat">
        <span>On beat</span>
        <select
          autoFocus
          value={arc.outline?.steps[step.id] ?? ''}
          onChange={(e) => placeOutlineStep(arc.id, step.id, e.target.value || null)}
        >
          <option value="">No beat yet</option>
          {arc.beatIds.map((id, i) =>
            beats[id] ? (
              <option key={id} value={id}>
                {i + 1}. {plainText(beats[id].title, lookup).trim() || 'Untitled beat'}
              </option>
            ) : null,
          )}
        </select>
      </label>
    </div>
  )
}
