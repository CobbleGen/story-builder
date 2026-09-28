import type { ReactNode } from 'react'
import { Handle, NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { ArrowUpRight, BookOpen, Check, CircleDashed, PenLine, X } from 'lucide-react'
import type { MapNode } from '../types'
import { chapterNumbers, useStory } from '../store/storyStore'
import { displayName } from '../lib/mentions'
import { MentionText } from '../components/MentionText'
import { CharacterAvatar } from '../components/CharacterAvatar'
import { useMap, useToolbarSide, type StoryFlowNode } from './mapShared'

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]

/** Connection points on all four sides; any can start or end a line. */
export function Handles() {
  return (
    <>
      {SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={side} className="map-handle" />
      ))}
    </>
  )
}

interface CardProps {
  node: MapNode
  selected: boolean
  /** The card's top edge on the map, to keep its toolbar on screen. */
  y: number
  kindLabel: ReactNode
  color?: string
  openLabel: string
  openIcon?: ReactNode
  children: ReactNode
  className?: string
}

function Card({ node, selected, y, kindLabel, color, openLabel, openIcon, children, className }: CardProps) {
  const { openItem, removeNode } = useMap()
  const side = useToolbarSide(selected, y)
  return (
    <div
      className={`map-card${className ? ` ${className}` : ''}`}
      style={color ? ({ '--card': color } as React.CSSProperties) : undefined}
    >
      <NodeToolbar isVisible={selected} position={side} className="map-toolbar">
        <button className="map-tool" onClick={() => openItem(node)}>
          {openIcon ?? <ArrowUpRight size={14} />} {openLabel}
        </button>
        <button className="map-tool" onClick={() => removeNode(node.id)} title="Remove from the map (the item itself stays)">
          <X size={14} /> Remove from map
        </button>
      </NodeToolbar>
      <Handles />
      <div className="map-card-kind">{kindLabel}</div>
      {children}
    </div>
  )
}

function Missing({ what }: { what: string }) {
  return (
    <div className="map-card missing">
      <Handles />
      <div className="map-card-kind">{what}</div>
      <div className="map-card-title muted">This was deleted</div>
    </div>
  )
}

type EntityNode = Extract<MapNode, { refId: string }>

export function ArcNode({ data, selected, positionAbsoluteY }: NodeProps<StoryFlowNode>) {
  const node = data.node as EntityNode
  const arc = useStory((s) => s.arcs.find((a) => a.id === node.refId))
  const characters = useStory((s) => s.characters)
  if (!arc) return <Missing what="Arc" />
  const cast = arc.characterIds.map((id) => characters.find((c) => c.id === id)).filter((c) => !!c)
  return (
    <Card node={node} selected={selected} y={positionAbsoluteY} color={arc.color} kindLabel="Arc" openLabel="Open arc">
      <div className="map-card-title">
        <MentionText text={arc.name} fallback="Untitled arc" />
      </div>
      {arc.description && (
        <div className="map-card-text">
          <MentionText text={arc.description} />
        </div>
      )}
      <div className="map-card-foot">
        <span>
          {arc.beatIds.length} beat{arc.beatIds.length === 1 ? '' : 's'}
        </span>
        {cast.length > 0 && (
          <span className="map-cast">
            {cast.slice(0, 5).map((c) => (
              <CharacterAvatar key={c.id} character={c} size="xs" />
            ))}
          </span>
        )}
      </div>
    </Card>
  )
}

export function ChapterNode({ data, selected, positionAbsoluteY }: NodeProps<StoryFlowNode>) {
  const node = data.node as EntityNode
  const chapters = useStory((s) => s.chapters)
  const chapter = chapters.find((c) => c.id === node.refId)
  const pov = useStory((s) => s.characters.find((c) => c.id === chapter?.povCharacterId))
  const words = useStory((s) => s.texts[node.refId]?.words ?? 0)
  const beats = useStory((s) => s.beats)
  if (!chapter) return <Missing what="Chapter" />
  const written = chapter.beatIds.filter((id) => beats[id]?.done).length
  return (
    <Card
      node={node}
      selected={selected}
      y={positionAbsoluteY}
      color={pov?.color ?? '#6f7480'}
      className="chapter-card"
      kindLabel={
        <>
          <BookOpen size={12} /> Chapter {chapterNumbers(chapters)[chapter.id]}
          {pov && <span className="map-pov">· {displayName(pov)}’s POV</span>}
        </>
      }
      openLabel="Write"
      openIcon={<PenLine size={14} />}
    >
      <div className="map-card-title serif">
        <MentionText text={chapter.title} fallback={<span className="muted">Untitled chapter</span>} />
      </div>
      {chapter.summary && (
        <div className="map-card-text">
          <MentionText text={chapter.summary} />
        </div>
      )}
      <div className="map-card-foot">
        <span>{words ? `${words.toLocaleString()} words` : 'Not started'}</span>
        {chapter.beatIds.length > 0 && (
          <span>
            {written}/{chapter.beatIds.length} beats written
          </span>
        )}
      </div>
    </Card>
  )
}

export function CharacterNode({ data, selected, positionAbsoluteY }: NodeProps<StoryFlowNode>) {
  const node = data.node as EntityNode
  const character = useStory((s) => s.characters.find((c) => c.id === node.refId))
  if (!character) return <Missing what="Character" />
  return (
    <Card node={node} selected={selected} y={positionAbsoluteY} color={character.color} className="character-card" kindLabel="Character" openLabel="Open character">
      <div className="map-character-head">
        <CharacterAvatar character={character} size="md" />
        <div className="map-card-title">{displayName(character)}</div>
      </div>
      {character.description && (
        <div className="map-card-text">
          <MentionText text={character.description} />
        </div>
      )}
      {character.attributes.filter((a) => a.label || a.value).length > 0 && (
        <dl className="map-attrs">
          {character.attributes
            .filter((a) => a.label || a.value)
            .slice(0, 3)
            .map((a) => (
              <div key={a.id}>
                <dt>{a.label || 'Note'}</dt>
                <dd>
                  <MentionText text={a.value} fallback="–" />
                </dd>
              </div>
            ))}
        </dl>
      )}
    </Card>
  )
}

export function BeatNode({ data, selected, positionAbsoluteY }: NodeProps<StoryFlowNode>) {
  const node = data.node as EntityNode
  const beat = useStory((s) => s.beats[node.refId])
  const arc = useStory((s) => s.arcs.find((a) => a.id === beat?.arcId))
  const chapters = useStory((s) => s.chapters)
  if (!beat) return <Missing what="Beat" />
  const number = beat.chapterId ? chapterNumbers(chapters)[beat.chapterId] : null
  return (
    <Card
      node={node}
      selected={selected}
      y={positionAbsoluteY}
      color={arc?.color}
      className="beat-card-map"
      kindLabel={
        <>
          <span className="arc-dot" /> <MentionText text={arc?.name ?? ''} fallback="Beat" />
        </>
      }
      openLabel="Edit beat"
    >
      <div className="map-card-title">
        <MentionText text={beat.title} fallback={<span className="muted">Untitled beat</span>} />
      </div>
      {beat.description && (
        <div className="map-card-text">
          <MentionText text={beat.description} />
        </div>
      )}
      <div className="map-card-foot">
        {number ? (
          <span className="map-chapter-tag">Chapter {number}</span>
        ) : (
          <span className="map-chapter-tag unplaced">
            <CircleDashed size={12} /> Not in a chapter
          </span>
        )}
        {beat.done && (
          <span className="map-done">
            <Check size={12} strokeWidth={3} /> Written
          </span>
        )}
      </div>
    </Card>
  )
}
