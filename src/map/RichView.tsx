import { Fragment, type ReactNode } from 'react'
import type { RichNode } from '../types'
import { useCharacterLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { displayName } from '../lib/mentions'
import { BEAT_MARK, MENTION_NODE } from '../lib/richText'
import { MentionName } from '../components/MentionText'
import { startsFlush, type PageBlock } from './pages'
import { Anchor } from './Anchor'

interface Context {
  lookup: ReturnType<typeof useCharacterLookup>
  /** Beat id -> its arc's colour, when arc colours are on. */
  beatColor: (beatId: string) => string | undefined
}

function renderText(node: RichNode, key: number, ctx: Context): ReactNode {
  let out: ReactNode = node.text ?? ''
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>
    else if (mark.type === 'italic') out = <em>{out}</em>
    else if (mark.type === 'underline') out = <u>{out}</u>
    else if (mark.type === 'strike') out = <s>{out}</s>
    else if (mark.type === BEAT_MARK) {
      const color = ctx.beatColor(String(mark.attrs?.beatId))
      if (color) out = <span className="beat-link" style={{ '--beat': color } as React.CSSProperties}>{out}</span>
    }
  }
  return <Fragment key={key}>{out}</Fragment>
}

function renderNode(node: RichNode, key: number, ctx: Context, className?: string): ReactNode {
  const children = () => (node.content ?? []).map((child, i) => renderNode(child, i, ctx))
  switch (node.type) {
    case 'text':
      return renderText(node, key, ctx)
    case MENTION_NODE: {
      const id = String(node.attrs?.id ?? '')
      const c = ctx.lookup.get(id)
      return (
        <MentionName
          key={key}
          segment={{
            kind: 'mention',
            id,
            text: c ? displayName(c) : String(node.attrs?.label ?? 'unknown character'),
            color: c?.color ?? null,
            known: !!c,
          }}
        />
      )
    }
    case 'hardBreak':
      return <br key={key} />
    case 'paragraph':
      return (
        <p key={key} className={className}>
          {children()}
        </p>
      )
    case 'heading': {
      const level = Number(node.attrs?.level) || 1
      const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5'
      return (
        <Tag key={key} className={className}>
          {children()}
        </Tag>
      )
    }
    case 'blockquote':
      return <blockquote key={key}>{children()}</blockquote>
    case 'bulletList':
      return <ul key={key}>{children()}</ul>
    case 'orderedList':
      return (
        <ol key={key} start={Number(node.attrs?.start) || 1}>
          {children()}
        </ol>
      )
    case 'listItem':
      return <li key={key}>{children()}</li>
    case 'horizontalRule':
      return <hr key={key} />
    default:
      return node.content ? <Fragment key={key}>{children()}</Fragment> : null
  }
}

interface Props {
  blocks: PageBlock[]
  /** The chapter's first page (its first paragraph isn't indented). */
  first?: boolean
  /** Anchors for a block's connection points: its own first, then saved ones that now lead to it. */
  anchorsFor?: (index: number) => string[]
}

/** A page of a chapter's text, read-only, looking like the manuscript. */
export function RichView({ blocks, first, anchorsFor }: Props) {
  const lookup = useCharacterLookup()
  const beats = useStory((s) => s.beats)
  const arcs = useStory((s) => s.arcs)
  const showColors = useUi((s) => s.showArcColors)
  const ctx: Context = {
    lookup,
    beatColor: (beatId) => {
      if (!showColors) return undefined
      const arcId = beats[beatId]?.arcId
      return arcs.find((a) => a.id === arcId)?.color
    },
  }
  return (
    <div className="map-rich">
      {blocks.map((b, i) => {
        const anchors = b.node.type === 'horizontalRule' ? undefined : anchorsFor?.(b.index)
        const flush = startsFlush(b.node, b.continued, blocks[i - 1]?.node, !!first)
        return (
          <div
            key={`${b.index}${b.continued ? 'c' : ''}`}
            className={`map-block${anchors ? ' map-anchor-row' : ''}`}
            data-anchor={anchors?.[0]}
          >
            {renderNode(b.node, i, ctx, flush ? 'flush' : undefined)}
            {anchors && <Anchor ids={anchors} />}
          </div>
        )
      })}
    </div>
  )
}
