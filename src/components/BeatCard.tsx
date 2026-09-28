import { forwardRef, type HTMLAttributes } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Arc, Beat } from '../types'
import { useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { involves } from '../lib/highlight'
import type { BeatDragData } from '../lib/dnd'
import { MentionText } from './MentionText'

type ViewProps = HTMLAttributes<HTMLDivElement> & {
  beat: Beat
  arc: Arc | undefined
  placeholder?: boolean
  overlay?: boolean
  dimmed?: boolean
}

/** The card shown inside a chapter. */
export const BeatCardView = forwardRef<HTMLDivElement, ViewProps>(function BeatCardView(
  { beat, arc, placeholder, overlay, dimmed, className, style, ...rest },
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
        <span className="arc-chip">
          <span className="arc-dot" />
          <MentionText text={arc?.name ?? ''} fallback="Untitled arc" />
        </span>
      </div>
    </div>
  )
})

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
