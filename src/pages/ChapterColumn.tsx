import { useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeftToLine, ArrowRightToLine, GripHorizontal, PenLine, Trash2 } from 'lucide-react'
import type { Chapter } from '../types'
import { useMentionLookup, useStory } from '../store/storyStore'
import { Link } from 'react-router-dom'
import { MentionTextarea } from '../components/MentionTextarea'
import { MentionText } from '../components/MentionText'
import { PovPicker } from '../components/PovPicker'
import { StatusPicker } from '../components/StatusPicker'
import { plainText } from '../lib/mentions'
import { BeatComposer } from '../components/BeatComposer'
import { BeatCardView, DraggableBeatCard } from '../components/BeatCard'
import { Menu } from '../components/Menu'
import { askConfirm } from '../lib/confirm'
import { chapterSortId, type ChapterDragData } from '../lib/dnd'

interface Props {
  chapter: Chapter
  number: number
  index: number
  /** Beat order to render, which differs from the store while a beat is dragged. */
  beatIds: string[]
  activeBeatId: string | null
  /** A beat is being dragged over this chapter. */
  isDropTarget: boolean
  autoFocus?: boolean
  onFocused?: () => void
  onInsertChapter: (index: number) => void
}

export function ChapterColumn({
  chapter,
  number,
  index,
  beatIds,
  activeBeatId,
  isDropTarget,
  autoFocus,
  onFocused,
  onInsertChapter,
}: Props) {
  const updateChapter = useStory((s) => s.updateChapter)
  const deleteChapter = useStory((s) => s.deleteChapter)
  const pov = useStory((s) => s.characters.find((c) => c.id === chapter.povCharacterId))
  const words = useStory((s) => s.texts[chapter.id]?.words ?? 0)
  const lookup = useMentionLookup()
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const data: ChapterDragData = { type: 'chapter', chapterId: chapter.id }
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: chapterSortId(chapter.id), data })

  useEffect(() => {
    if (!autoFocus) return
    titleRef.current?.focus()
    titleRef.current?.closest('.chapter')?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
    onFocused?.()
  }, [autoFocus, onFocused])

  const remove = async () => {
    const count = chapter.beatIds.length
    const notes = [
      words ? `Its written text (${words.toLocaleString()} word${words === 1 ? '' : 's'}) will be deleted.` : '',
      count ? `Its ${count} beat${count === 1 ? '' : 's'} will stay on ${count === 1 ? 'its arc' : 'their arcs'}, unplaced.` : '',
    ].filter(Boolean)
    const ok = await askConfirm({
      title: `Delete chapter ${number}${chapter.title ? `, “${plainText(chapter.title, lookup)}”` : ''}?`,
      message: notes.length ? notes.join(' ') : undefined,
      confirmLabel: 'Delete chapter',
      danger: true,
    })
    if (ok) deleteChapter(chapter.id)
  }

  return (
    <section
      ref={setNodeRef}
      className={`chapter${isDragging ? ' placeholder' : ''}${isDropTarget ? ' drop-target' : ''}${pov ? ' has-pov' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition, '--pov': pov?.color } as React.CSSProperties}
      aria-label={`Chapter ${number}`}
    >
      <header className="chapter-head">
        <div className="chapter-top">
          <button
            ref={setActivatorNodeRef}
            className="chapter-handle"
            {...attributes}
            {...listeners}
            aria-roledescription="draggable chapter"
            aria-label={`Chapter ${number}. Drag to reorder.`}
          >
            <span className="chapter-number">Chapter {number}</span>
            <GripHorizontal size={16} className="grip" />
          </button>
          <PovPicker chapter={chapter} />
          <Menu
            label="Chapter options"
            items={[
              { label: 'Insert chapter before', icon: <ArrowLeftToLine size={16} />, onSelect: () => onInsertChapter(index) },
              { label: 'Insert chapter after', icon: <ArrowRightToLine size={16} />, onSelect: () => onInsertChapter(index + 1) },
              { label: 'Delete chapter', icon: <Trash2 size={16} />, onSelect: remove, danger: true },
            ]}
          />
        </div>
        <MentionTextarea
          ref={titleRef}
          className="chapter-title"
          value={chapter.title}
          placeholder="Untitled chapter"
          aria-label={`Chapter ${number} title`}
          submitOnEnter
          onChange={(title) => updateChapter(chapter.id, { title })}
        />
        <MentionTextarea
          className="chapter-summary"
          value={chapter.summary}
          placeholder="What happens in this chapter?"
          aria-label={`Chapter ${number} summary`}
          onChange={(summary) => updateChapter(chapter.id, { summary })}
        />
        <div className="chapter-meta">
          <Link to={`/write/${chapter.id}`} className="chapter-write" title="Open this chapter in the manuscript">
            <PenLine size={13} />
            {words ? `${words.toLocaleString()} word${words === 1 ? '' : 's'}` : 'Write'}
            {chapter.targetWords ? <span className="chapter-target"> / {chapter.targetWords.toLocaleString()}</span> : null}
          </Link>
          <StatusPicker chapter={chapter} />
        </div>
      </header>
      <div className="chapter-beats" data-chapter-list={chapter.id}>
        {beatIds.map((id) => (
          <DraggableBeatCard key={id} beatId={id} activeBeatId={activeBeatId} />
        ))}
        {beatIds.length === 0 && <div className="chapter-empty">Drag beats here</div>}
      </div>
      <BeatComposer chapterId={chapter.id} />
    </section>
  )
}

/** Read-only chapter shown under the pointer while a chapter is dragged. */
export function ChapterOverlay({ chapter, number }: { chapter: Chapter; number: number }) {
  const beats = useStory((s) => s.beats)
  const arcs = useStory((s) => s.arcs)
  const pov = useStory((s) => s.characters.find((c) => c.id === chapter.povCharacterId))
  return (
    <section
      className={`chapter overlay${pov ? ' has-pov' : ''}`}
      style={{ '--pov': pov?.color } as React.CSSProperties}
    >
      <header className="chapter-head">
        <div className="chapter-top">
          <div className="chapter-handle">
            <span className="chapter-number">Chapter {number}</span>
            <GripHorizontal size={16} className="grip" />
          </div>
        </div>
        <div className="chapter-title static">
          <MentionText text={chapter.title} fallback={<span className="muted">Untitled chapter</span>} />
        </div>
        {chapter.summary && (
          <div className="chapter-summary static">
            <MentionText text={chapter.summary} />
          </div>
        )}
      </header>
      <div className="chapter-beats">
        {chapter.beatIds.map((id) =>
          beats[id] ? (
            <BeatCardView key={id} beat={beats[id]} arc={arcs.find((a) => a.id === beats[id].arcId)} />
          ) : null,
        )}
      </div>
    </section>
  )
}
