import type { ReactNode } from 'react'
import { parseMentions, type Segment } from '../lib/mentions'
import { useCharacterLookup } from '../store/storyStore'

/** A mention as it appears in text: `@Name` tinted in the character's color. */
export function MentionChip({ segment }: { segment: Extract<Segment, { kind: 'mention' }> }) {
  return (
    <span
      className={`mention${segment.known ? '' : ' unknown'}`}
      style={segment.color ? ({ '--char': segment.color } as React.CSSProperties) : undefined}
    >
      <span className="mention-at">@</span>
      {segment.text.slice(1)}
    </span>
  )
}

/** Renders stored text with its character mentions highlighted. */
export function MentionText({ text, fallback = null }: { text: string; fallback?: ReactNode }) {
  const lookup = useCharacterLookup()
  if (!text) return <>{fallback}</>
  return (
    <>
      {parseMentions(text, lookup).map((s, i) =>
        s.kind === 'text' ? s.text : <MentionChip key={i} segment={s} />,
      )}
    </>
  )
}
