import { Fragment, type ReactNode } from 'react'
import type { RichNode } from '../types'
import { useMentionLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { displayName } from '../lib/mentions'
import { BEAT_MARK, MENTION_NODE, PICTURE_NODE, pictureSizeOf } from '../lib/richText'
import { useImageUrl } from '../store/images'
import { MentionName } from '../components/MentionText'
import { startsFlush, type PageBlock } from './pages'
import { Anchor } from './Anchor'

interface Context {
  lookup: ReturnType<typeof useMentionLookup>
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
            text: c ? displayName(c) : String(node.attrs?.label ?? 'unknown'),
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
    case PICTURE_NODE:
      return <PagePicture key={key} node={node} />
    default:
      return node.content ? <Fragment key={key}>{children()}</Fragment> : null
  }
}

/** The box a picture takes on a page: its width by size, its height by its shape (known before it loads). */
function pictureBoxStyle(node: RichNode): React.CSSProperties {
  const width = Number(node.attrs?.width) || 0
  const height = Number(node.attrs?.height) || 0
  return width && height ? { aspectRatio: `${width} / ${height}` } : { aspectRatio: '4 / 3' }
}

function PagePicture({ node }: { node: RichNode }) {
  const url = useImageUrl(node.attrs?.imageId as string | undefined)
  return (
    <div className={`map-page-picture size-${pictureSizeOf(node.attrs?.size)}`} style={pictureBoxStyle(node)}>
      {url && <img src={url} alt="" draggable={false} />}
    </div>
  )
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
  const lookup = useMentionLookup()
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
