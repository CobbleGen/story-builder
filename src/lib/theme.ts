import { useEffect, useSyncExternalStore } from 'react'
import { useUi } from '../store/uiStore'

// The theme is set on <html data-theme="…">; index.html does the same before
// the app loads, so the page never flashes the wrong colours.

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function useSystemDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const q = darkQuery()
      q.addEventListener('change', onChange)
      return () => q.removeEventListener('change', onChange)
    },
    () => darkQuery().matches,
    () => false,
  )
}

/** 'light' or 'dark': the chosen theme, or the device's when set to follow it. */
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useUi((s) => s.theme)
  const systemDark = useSystemDark()
  if (theme === 'system') return systemDark ? 'dark' : 'light'
  return theme
}

/** Keeps <html data-theme> in step with the setting. */
export function useApplyTheme() {
  const resolved = useResolvedTheme()
  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#1c1b19' : '#f3f1ec')
  }, [resolved])
}
