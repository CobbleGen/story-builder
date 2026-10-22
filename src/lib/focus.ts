import { useUi } from '../store/uiStore'

// Focus mode on the manuscript page: only the page on screen.

/** The keys that go in and out of focus mode. */
export const FOCUS_KEYS = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘⇧F' : 'Ctrl+Shift+F'

export const fullscreenOn = () => typeof document !== 'undefined' && !!document.fullscreenElement

/** Leaves focus mode, and full screen with it. */
export function leaveFocus() {
  useUi.getState().setFocusMode(false)
  if (fullscreenOn()) void document.exitFullscreen().catch(() => {})
}
