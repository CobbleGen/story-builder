import { useEffect } from 'react'
import { useUi } from '../store/uiStore'
import { MAC } from './undoShortcuts'

/** How the search shortcut is written on this device. */
export const SEARCH_KEYS = MAC ? '⌘K' : 'Ctrl+K'

/** Ctrl/⌘+K opens search (or closes it) from anywhere, even while typing. */
export function useSearchShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(MAC ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return
      e.preventDefault()
      const ui = useUi.getState()
      ui.setSearchOpen(!ui.searchOpen)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
