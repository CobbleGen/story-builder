import { useEffect } from 'react'
import { useStory } from '../store/storyStore'

export const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Text fields and the manuscript have their own undo; the shortcuts leave them to it. */
const ownsUndo = (el: EventTarget | null) =>
  el instanceof Element && !!el.closest('input, textarea, select, [contenteditable="true"], .ProseMirror')

/** Ctrl/⌘+Z to undo, Shift+Ctrl/⌘+Z or Ctrl+Y to redo, anywhere outside a text field. */
export function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || ownsUndo(e.target)) return
      const key = e.key.toLowerCase()
      const redo = (key === 'z' && e.shiftKey) || (key === 'y' && !MAC)
      const undo = key === 'z' && !e.shiftKey
      if (!undo && !redo) return
      e.preventDefault()
      if (undo) useStory.getState().undo()
      else useStory.getState().redo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

