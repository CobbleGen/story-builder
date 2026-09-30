import { useState, type ReactNode } from 'react'
import { ChevronRight, PanelLeftClose, Search, StickyNote, Type } from 'lucide-react'
import type { Beat } from '../types'
import { useMentionLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { displayName, plainText } from '../lib/mentions'
import { MentionText } from '../components/MentionText'
import { CharacterAvatar } from '../components/CharacterAvatar'
import { ElementIcon } from '../components/ElementIcon'
import { ChapterTag } from '../components/ChapterTag'
import { DRAG_MIME, type PaletteItem } from './mapShared'

interface Props {
  /** Ids of story items already on the map. */
  onMap: Set<string>
  onAdd: (item: PaletteItem) => void
}

function PaletteEntry({
  item,
  onAdd,
  onMap,
  children,
  style,
}: {
  item: PaletteItem
  onAdd: (item: PaletteItem) => void
  onMap?: boolean
  children: ReactNode
  style?: React.CSSProperties
}) {
  return (
    <li>
      <button
        className="palette-item"
        draggable
        style={style}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item))
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onClick={() => onAdd(item)}
        title="Drag onto the map, or click to add it in the middle"
      >
        {children}
        {onMap && <span className="palette-on-map" title="Already on the map" />}
      </button>
    </li>
  )
}

function Section({ title, count, children, defaultOpen = true }: { title: string; count: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  if (count === 0) return null
  return (
    <section className="palette-section">
      <button className="palette-section-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronRight size={14} className="chevron" />
        {title}
        <span className="palette-count">{count}</span>
      </button>
      {open && <ul className="palette-list">{children}</ul>}
    </section>
  )
}

/** The left panel of the mind map: everything that can be placed on it. */
export function MapPalette({ onMap, onAdd }: Props) {
  const chapters = useStory((s) => s.chapters)
  const arcs = useStory((s) => s.arcs)
  const characters = useStory((s) => s.characters)
  const elements = useStory((s) => s.elements)
  const beats = useStory((s) => s.beats)
  const lookup = useMentionLookup()
  const toggle = useUi((s) => s.toggleMapPalette)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const match = (text: string) => !q || plainText(text, lookup).toLowerCase().includes(q)

  const chapterList = chapters.map((c, i) => ({ c, n: i + 1 })).filter(({ c, n }) => match(c.title) || String(n) === q)
  const arcList = arcs.filter((a) => match(a.name))
  const characterList = characters.filter((c) => match(displayName(c)))
  const elementList = elements.filter((e) => match(displayName(e)))
  const beatList = arcs.flatMap((a) =>
    a.beatIds.map((id) => beats[id]).filter((b): b is Beat => !!b && match(b.title)),
  )
  const numbers = Object.fromEntries(chapters.map((c, i) => [c.id, i + 1]))

  return (
    <aside className="map-palette" aria-label="Add to the map">
      <div className="beats-head">
        <h2>Add to map</h2>
        <button className="icon-btn" onClick={toggle} title="Hide panel" aria-label="Hide panel">
          <PanelLeftClose size={17} />
        </button>
      </div>
      <div className="palette-tools">
        <PaletteToolTile item={{ kind: 'note' }} onAdd={onAdd} icon={<StickyNote size={18} />} label="Sticky note" />
        <PaletteToolTile item={{ kind: 'text' }} onAdd={onAdd} icon={<Type size={18} />} label="Text" />
      </div>
      <label className="palette-search">
        <Search size={14} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find in your story" aria-label="Find in your story" />
      </label>
      <div className="palette-scroll">
        <Section title="Chapters" count={chapterList.length}>
          {chapterList.map(({ c, n }) => (
            <PaletteEntry key={c.id} item={{ kind: 'chapter', refId: c.id }} onAdd={onAdd} onMap={onMap.has(c.id)}>
              <span className="palette-num">{n}</span>
              <span className="palette-name">
                <MentionText text={c.title} fallback={<span className="muted">Untitled chapter</span>} />
              </span>
            </PaletteEntry>
          ))}
        </Section>
        <Section title="Arcs" count={arcList.length}>
          {arcList.map((a) => (
            <PaletteEntry
              key={a.id}
              item={{ kind: 'arc', refId: a.id }}
              onAdd={onAdd}
              onMap={onMap.has(a.id)}
              style={{ '--arc': a.color } as React.CSSProperties}
            >
              <span className="arc-dot" />
              <span className="palette-name">
                <MentionText text={a.name} fallback="Untitled arc" />
              </span>
            </PaletteEntry>
          ))}
        </Section>
        <Section title="Characters" count={characterList.length}>
          {characterList.map((c) => (
            <PaletteEntry key={c.id} item={{ kind: 'character', refId: c.id }} onAdd={onAdd} onMap={onMap.has(c.id)}>
              <CharacterAvatar character={c} size="xs" />
              <span className="palette-name">{displayName(c)}</span>
            </PaletteEntry>
          ))}
        </Section>
        <Section title="Places & things" count={elementList.length}>
          {elementList.map((e) => (
            <PaletteEntry key={e.id} item={{ kind: 'element', refId: e.id }} onAdd={onAdd} onMap={onMap.has(e.id)}>
              <ElementIcon element={e} size="xs" />
              <span className="palette-name">{displayName(e)}</span>
            </PaletteEntry>
          ))}
        </Section>
        <Section title="Beats" count={beatList.length} defaultOpen={beatList.length <= 12 || !!q}>
          {beatList.map((b) => {
            const arc = arcs.find((a) => a.id === b.arcId)
            return (
              <PaletteEntry
                key={b.id}
                item={{ kind: 'beat', refId: b.id }}
                onAdd={onAdd}
                onMap={onMap.has(b.id)}
                style={{ '--arc': arc?.color } as React.CSSProperties}
              >
                <ChapterTag number={b.chapterId ? numbers[b.chapterId] : null} />
                <span className="palette-name">
                  <MentionText text={b.title} fallback="Untitled beat" />
                </span>
              </PaletteEntry>
            )
          })}
        </Section>
        {q && !chapterList.length && !arcList.length && !characterList.length && !elementList.length && !beatList.length && (
          <p className="beats-empty">Nothing matches “{query}”.</p>
        )}
      </div>
    </aside>
  )
}

function PaletteToolTile({ item, onAdd, icon, label }: { item: PaletteItem; onAdd: (item: PaletteItem) => void; icon: ReactNode; label: string }) {
  return (
    <button
      className="palette-tool"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => onAdd(item)}
      title="Drag onto the map, or click to add one in the middle"
    >
      {icon}
      {label}
    </button>
  )
}
