import { forwardRef, type HTMLAttributes } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Arc, Beat } from '../types'
import { useMentionLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { involves } from '../lib/highlight'
import type { BeatDragData } from '../lib/dnd'
import { Check, ChevronDown } from 'lucide-react'
import { plainText } from '../lib/mentions'
import { MentionText } from './MentionText'

type ViewProps = HTMLAttributes<HTMLDivElement> & {
  beat: Beat
  arc: Arc | undefined
  placeholder?: boolean
  overlay?: boolean
  dimmed?: boolean
  /** Its arc's name picks another arc to move it to. */
  arcPicker?: boolean
}

/** The card shown inside a chapter. */
export const BeatCardView = forwardRef<HTMLDivElement, ViewProps>(function BeatCardView(
  { beat, arc, placeholder, overlay, dimmed, arcPicker, className, style, ...rest },
  ref,
) {
  const classes = ['beat-card']
  if (placeholder) classes.push('placeholder')
  if (overlay) classes.push('overlay')
  if (dimmed) classes.push('dimmed')
  if (className) classes.push(className)
  return (
    <div
      ref={ref}
      className={classes.join(' ')}
      style={{ '--arc': arc?.color ?? '#6f7480', ...style } as React.CSSProperties}
      data-beat-id={beat.id}
      {...rest}
    >
      <div className="beat-title">
        <MentionText text={beat.title} fallback={<span className="muted">Untitled beat</span>} />
      </div>
      {beat.description && (
        <div className="beat-desc">
          <MentionText text={beat.description} />
        </div>
      )}
      <div className="beat-meta">
        {beat.done && (
          <span className="beat-done" title="Written">
            <Check size={12} strokeWidth={3} />
          </span>
        )}
        {arcPicker ? (
          <ArcPicker beat={beat} arc={arc} />
        ) : (
          <span className="arc-chip">
            <span className="arc-dot" />
            <MentionText text={arc?.name ?? ''} fallback="Untitled arc" />
          </span>
        )}
      </div>
    </div>
  )
})

/** A card's arc, to choose another one for the beat (without picking the card up or opening it). */
function ArcPicker({ beat, arc }: { beat: Beat; arc: Arc | undefined }) {
  const arcs = useStory((s) => s.arcs)
  const setBeatArc = useStory((s) => s.setBeatArc)
  const lookup = useMentionLookup()
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <label
      className="arc-chip picker"
      title="Move it to another arc"
      onClick={stop}
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onKeyDown={stop}
    >
      <span className="arc-dot" />
      <MentionText text={arc?.name ?? ''} fallback="Untitled arc" />
      <ChevronDown size={11} className="arc-chip-more" aria-hidden />
      <select value={beat.arcId} onChange={(e) => setBeatArc(beat.id, e.target.value)} aria-label="Arc (choose another to move the beat to it)">
        {arcs.map((a) => (
          <option key={a.id} value={a.id}>
            {plainText(a.name, lookup).trim() || 'Untitled arc'}
          </option>
        ))}
      </select>
    </label>
  )
}

interface DraggableProps {
  beatId: string
  /** The beat being dragged right now, rendered as a placeholder. */
  activeBeatId: string | null
}

export function DraggableBeatCard({ beatId, activeBeatId }: DraggableProps) {
  const beat = useStory((s) => s.beats[beatId])
  const arc = useStory((s) => (beat ? s.arcs.find((a) => a.id === beat.arcId) : undefined))
  const highlight = useUi((s) => s.highlight)
  const openBeat = useUi((s) => s.openBeat)
  const data: BeatDragData = { type: 'beat', beatId, origin: 'board' }
  const { setNodeRef, attributes, listeners } = useDraggable({ id: beatId, data })

  if (!beat) return null
  return (
    <BeatCardView
      ref={setNodeRef}
      beat={beat}
      arc={arc}
      placeholder={activeBeatId === beatId}
      dimmed={highlight !== null && !involves(beat, arc, highlight)}
      arcPicker
      {...attributes}
      {...listeners}
      aria-roledescription="draggable beat"
      onClick={() => openBeat(beatId)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        if (e.key === 'Enter' && !e.defaultPrevented) openBeat(beatId)
      }}
    />
  )
}
