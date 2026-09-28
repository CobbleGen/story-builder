import type { ReactNode } from 'react'
import { parseMentions, type Segment } from '../lib/mentions'
import { useCharacterLookup } from '../store/storyStore'

/** A mention as it appears in text: the character's name, in their color. */
export function MentionName({ segment }: { segment: Extract<Segment, { kind: 'mention' }> }) {
  return (
    <span
      className={`mention${segment.known ? '' : ' unknown'}`}
      style={segment.color ? ({ '--char': segment.color } as React.CSSProperties) : undefined}
    >
      {segment.text}
    </span>
  )
}

/** Renders stored text with its character mentions in their colors. */
export function MentionText({ text, fallback = null }: { text: string; fallback?: ReactNode }) {
  const lookup = useCharacterLookup()
  if (!text) return <>{fallback}</>
  return (
    <>
      {parseMentions(text, lookup).map((s, i) =>
        s.kind === 'text' ? s.text : <MentionName key={i} segment={s} />,
      )}
    </>
  )
}
