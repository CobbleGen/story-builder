import type { ReactNode } from 'react'
import { Handle, NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { ArrowUpRight, BookOpen, Check, ChevronDown, CircleDashed, FileText, ListTree, PenLine, X } from 'lucide-react'
import type { MapCardView, MapNode } from '../types'
import { chapterNumbers, useStory } from '../store/storyStore'
import { displayName } from '../lib/mentions'
import { MentionText } from '../components/MentionText'
import { CharacterAvatar } from '../components/CharacterAvatar'
import { useMap, useToolbarPlacement, type StoryFlowNode } from './mapShared'
import { BeatList, ChapterPages } from './CardPanels'

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
  kindLabel: ReactNode
  color?: string
  openLabel: string
  openIcon?: ReactNode
  children: ReactNode
  className?: string
}

function Card({ node, selected, kindLabel, color, openLabel, openIcon, children, className }: CardProps) {
  const { openItem, removeNode } = useMap()
  const toolbar = useToolbarPlacement(node.id, selected)
  const expanded = 'expanded' in node && node.expanded
  return (
    <div
      className={`map-card${className ? ` ${className}` : ''}${expanded ? ` expanded ${expanded}` : ''}`}
      style={color ? ({ '--card': color } as React.CSSProperties) : undefined}
    >
      <NodeToolbar isVisible={selected} position={toolbar.position} align={toolbar.align} className="map-toolbar">
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

/** Opens a card up to one of its views, or closes it again. */
function useToggleView(node: EntityNode) {
  const updateMapNode = useStory((s) => s.updateMapNode)
  return (view: MapCardView) => updateMapNode(node.id, { expanded: node.expanded === view ? undefined : view })
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
  title,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      className={`map-view-btn nodrag${active ? ' active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      aria-expanded={active}
      title={title}
    >
      {icon}
      {label}
      <ChevronDown size={12} className="chevron" />
    </button>
  )
}

export function ArcNode({ data, selected }: NodeProps<StoryFlowNode>) {
  const node = data.node as EntityNode
  const arc = useStory((s) => s.arcs.find((a) => a.id === node.refId))
  const characters = useStory((s) => s.characters)
  const toggle = useToggleView(node)
  if (!arc) return <Missing what="Arc" />
  const cast = arc.characterIds.map((id) => characters.find((c) => c.id === id)).filter((c) => !!c)
  return (
    <Card node={node} selected={selected} color={arc.color} className="arc-card" kindLabel="Arc" openLabel="Open arc">
      <div className="map-card-title">
        <MentionText text={arc.name} fallback="Untitled arc" />
      </div>
      {arc.description && (
        <div className="map-card-text">
          <MentionText text={arc.description} />
        </div>
      )}
      <div className="map-card-foot">
        <ViewButton
          active={node.expanded === 'beats'}
          onClick={() => toggle('beats')}
          icon={<ListTree size={13} />}
          label={`${arc.beatIds.length} beat${arc.beatIds.length === 1 ? '' : 's'}`}
          title={node.expanded === 'beats' ? 'Hide the beats' : 'Show the beats in this arc'}
        />
        {cast.length > 0 && (
          <span className="map-cast">
            {cast.slice(0, 5).map((c) => (
              <CharacterAvatar key={c.id} character={c} size="xs" />
            ))}
          </span>
        )}
      </div>
      {node.expanded === 'beats' && <BeatList beatIds={arc.beatIds} scope={{ kind: 'arc', arcId: arc.id }} />}
    </Card>
  )
}

export function ChapterNode({ data, selected }: NodeProps<StoryFlowNode>) {
  const node = data.node as EntityNode
  const chapters = useStory((s) => s.chapters)
  const chapter = chapters.find((c) => c.id === node.refId)
  const pov = useStory((s) => s.characters.find((c) => c.id === chapter?.povCharacterId))
  const words = useStory((s) => s.texts[node.refId]?.words ?? 0)
  const beats = useStory((s) => s.beats)
  const { openItem } = useMap()
  const toggle = useToggleView(node)
  if (!chapter) return <Missing what="Chapter" />
  const written = chapter.beatIds.filter((id) => beats[id]?.done).length
  const number = chapterNumbers(chapters)[chapter.id]
  return (
    <Card
      node={node}
      selected={selected}
     
      color={pov?.color ?? '#6f7480'}
      className="chapter-card"
      kindLabel={
        <>
          <BookOpen size={12} /> Chapter {number}
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
        <span className="map-views">
          <ViewButton
            active={node.expanded === 'text'}
            onClick={() => toggle('text')}
            icon={<FileText size={13} />}
            label="Pages"
            title={node.expanded === 'text' ? 'Hide the pages' : 'Read the chapter here, a page at a time'}
          />
          <ViewButton
            active={node.expanded === 'beats'}
            onClick={() => toggle('beats')}
            icon={<ListTree size={13} />}
            label={
              <>
                Beats
                {chapter.beatIds.length > 0 && (
                  <span className="map-view-count" title={`${written} of ${chapter.beatIds.length} written`}>
                    {written}/{chapter.beatIds.length}
                  </span>
                )}
              </>
            }
            title={node.expanded === 'beats' ? 'Hide the beats' : 'Show the beats in this chapter'}
          />
        </span>
      </div>
      {node.expanded === 'text' && (
        <ChapterPages chapterId={chapter.id} number={number} title={chapter.title} onWrite={() => openItem(node)} />
      )}
      {node.expanded === 'beats' && <BeatList beatIds={chapter.beatIds} scope={{ kind: 'chapter', chapterId: chapter.id }} />}
    </Card>
  )
}

export function CharacterNode({ data, selected }: NodeProps<StoryFlowNode>) {
  const node = data.node as EntityNode
  const character = useStory((s) => s.characters.find((c) => c.id === node.refId))
  if (!character) return <Missing what="Character" />
  return (
    <Card node={node} selected={selected} color={character.color} className="character-card" kindLabel="Character" openLabel="Open character">
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

export function BeatNode({ data, selected }: NodeProps<StoryFlowNode>) {
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
