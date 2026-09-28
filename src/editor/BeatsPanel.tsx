import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { Check, Highlighter, Link2, PanelLeftClose } from 'lucide-react'
import type { Beat, Chapter } from '../types'
import { useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { MentionText } from '../components/MentionText'
import { BeatComposer } from '../components/BeatComposer'
import { linkSelection, linkedRanges, unlinkBeat } from './beatLinks'

interface Props {
  chapter: Chapter
  editor: Editor
  onHover: (beatId: string | null) => void
}

// Buttons here must not take focus from the editor, or its selection is lost.
const keepSelection = (e: React.MouseEvent) => e.preventDefault()

/** The chapter's beats as a checklist, linked to the text as they're written. */
export function BeatsPanel({ chapter, editor, onHover }: Props) {
  const beats = useStory((s) => s.beats)
  const arcs = useStory((s) => s.arcs)
  const updateBeat = useStory((s) => s.updateBeat)
  const openBeat = useUi((s) => s.openBeat)
  const showArcColors = useUi((s) => s.showArcColors)
  const toggleArcColors = useUi((s) => s.toggleArcColors)
  const togglePanel = useUi((s) => s.toggleBeatsPanel)
  const { hasSelection, linked } = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      hasSelection: !e.state.selection.empty,
      linked: [...linkedRanges(e.state.doc).keys()].sort().join(' '),
    }),
  })
  const linkedIds = new Set(linked.split(' ').filter(Boolean))
  const list = chapter.beatIds.map((id) => beats[id]).filter((b): b is Beat => !!b)
  const written = list.filter((b) => b.done).length

  /** Ticking links the selected text (if any); unticking removes the beat's links. */
  const toggle = (beat: Beat) => {
    if (beat.done) {
      unlinkBeat(editor, beat.id)
      updateBeat(beat.id, { done: false })
    } else {
      linkSelection(editor, beat.id)
      updateBeat(beat.id, { done: true })
    }
  }

  const linkMore = (beat: Beat) => {
    linkSelection(editor, beat.id)
    if (!beat.done) updateBeat(beat.id, { done: true })
  }

  /** Jumps to the beat's text if it has any, otherwise opens the beat. */
  const reveal = (beat: Beat) => {
    const range = linkedRanges(editor.state.doc).get(beat.id)
    if (range) editor.chain().focus().setTextSelection(range).scrollIntoView().run()
    else openBeat(beat.id)
  }

  return (
    <aside className="beats-panel" aria-label="Beats in this chapter">
      <div className="beats-head">
        <h2>Beats</h2>
        <span className="beats-progress">
          {written}/{list.length} written
        </span>
        <button className="icon-btn" onClick={togglePanel} title="Hide beats" aria-label="Hide beats">
          <PanelLeftClose size={17} />
        </button>
      </div>
      <button
        role="switch"
        aria-checked={showArcColors}
        className="switch-row"
        onMouseDown={keepSelection}
        onClick={toggleArcColors}
      >
        <span>Arc colours in text</span>
        <span className="switch" aria-hidden />
      </button>
      <p className="beats-hint">
        {hasSelection
          ? 'Tick a beat to link the selected text to it.'
          : 'Select some text, then tick a beat to colour that text in its arc.'}
      </p>
      {list.length > 0 ? (
        <ul className="beat-checklist">
          {list.map((beat) => {
            const arc = arcs.find((a) => a.id === beat.arcId)
            const isLinked = linkedIds.has(beat.id)
            return (
              <li
                key={beat.id}
                className={`check-row${beat.done ? ' done' : ''}`}
                style={{ '--arc': arc?.color } as React.CSSProperties}
                onMouseEnter={() => onHover(beat.id)}
                onMouseLeave={() => onHover(null)}
              >
                <button
                  role="checkbox"
                  aria-checked={beat.done}
                  className="check-box"
                  onMouseDown={keepSelection}
                  onClick={() => toggle(beat)}
                  title={beat.done ? 'Mark as not written (removes its text colour)' : hasSelection ? 'Mark as written and link the selected text' : 'Mark as written'}
                >
                  <Check size={13} strokeWidth={3} />
                </button>
                <button
                  className="check-title"
                  onMouseDown={keepSelection}
                  onClick={() => reveal(beat)}
                  title={isLinked ? 'Show the linked text' : 'Open this beat'}
                >
                  <span className="check-text">
                    <MentionText text={beat.title} fallback="Untitled beat" />
                  </span>
                  <span className="check-arc">
                    <span className="arc-dot" />
                    <MentionText text={arc?.name ?? ''} fallback="Untitled arc" />
                    {isLinked && (
                      <span className="check-linked">
                        <Link2 size={12} /> in text
                      </span>
                    )}
                  </span>
                </button>
                {hasSelection && beat.done && (
                  <button
                    className="icon-btn check-link"
                    onMouseDown={keepSelection}
                    onClick={() => linkMore(beat)}
                    title="Link the selected text to this beat too"
                    aria-label="Link the selected text to this beat"
                  >
                    <Highlighter size={15} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="beats-empty">No beats in this chapter yet. Add one below, or select text and choose “New beat”.</p>
      )}
      <BeatComposer chapterId={chapter.id} />
    </aside>
  )
}
