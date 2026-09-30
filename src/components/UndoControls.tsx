import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Redo2, Undo2 } from 'lucide-react'
import { useStory } from '../store/storyStore'
import { useHistory } from '../store/history'
import { MAC } from '../lib/undoShortcuts'

const MOD = MAC ? '⌘' : 'Ctrl+'

/** Undo and redo buttons for the top bar (the manuscript has the editor's own). */
export function UndoButtons() {
  const past = useHistory((s) => s.past)
  const future = useHistory((s) => s.future)
  const undo = useStory((s) => s.undo)
  const redo = useStory((s) => s.redo)
  const { pathname } = useLocation()
  if (pathname.startsWith('/write')) return null
  const nextUndo = past[past.length - 1]
  const nextRedo = future[future.length - 1]
  return (
    <span className="undo-buttons">
      <button
        className="icon-btn"
        onClick={undo}
        disabled={!nextUndo}
        aria-label={nextUndo ? `Undo ${nextUndo.label}` : 'Undo'}
        title={nextUndo ? `Undo ${nextUndo.label} (${MOD}Z)` : 'Nothing to undo'}
      >
        <Undo2 size={17} />
      </button>
      <button
        className="icon-btn"
        onClick={redo}
        disabled={!nextRedo}
        aria-label={nextRedo ? `Redo ${nextRedo.label}` : 'Redo'}
        title={nextRedo ? `Redo ${nextRedo.label} (${MAC ? '⇧⌘Z' : 'Ctrl+Y'})` : 'Nothing to redo'}
      >
        <Redo2 size={17} />
      </button>
    </span>
  )
}

/** A brief note after undoing or redoing, so it's clear what changed. */
export function UndoNotice() {
  const notice = useHistory((s) => s.notice)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => useHistory.setState({ notice: null }), 2600)
    return () => clearTimeout(timer)
  }, [notice])
  if (!notice) return null
  const text = notice.text.charAt(0).toUpperCase() + notice.text.slice(1)
  return (
    <div key={notice.id} className="undo-notice" role="status">
      {text}
    </div>
  )
}
