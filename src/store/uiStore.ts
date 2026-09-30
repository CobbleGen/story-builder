import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type SidebarMode = 'arcs' | 'characters'
/** Light or dark colours, or whichever the device is set to. */
export type ThemeSetting = 'system' | 'light' | 'dark'

/** What the board is emphasising (hovering an arc or character in the sidebar). */
export type Highlight = { kind: 'arc' | 'character'; id: string } | null

interface UiState {
  sidebarOpen: boolean
  sidebarMode: SidebarMode
  expandedArcs: Record<string, boolean>
  /** Arc preselected when adding a beat from a chapter. */
  lastArcId: string | null
  highlight: Highlight
  /** Beat open in the editor dialog. */
  editingBeatId: string | null
  /** Manuscript: colour text linked to beats in their arc's colour. */
  showArcColors: boolean
  /** Manuscript: the beats checklist is open. */
  beatsPanelOpen: boolean
  /** Chapter last opened in the manuscript. */
  lastChapterId: string | null
  /** Where the mind map was last scrolled and zoomed to. */
  mapViewport: { x: number; y: number; zoom: number } | null
  /** Mind map: the "add to map" panel is open. */
  mapPaletteOpen: boolean
  theme: ThemeSetting
  /** The word count and goals dialog is open. */
  progressOpen: boolean
  toggleSidebar: () => void
  setSidebarMode: (mode: SidebarMode) => void
  toggleArc: (arcId: string) => void
  setLastArcId: (arcId: string) => void
  setHighlight: (highlight: Highlight) => void
  openBeat: (beatId: string | null) => void
  toggleArcColors: () => void
  toggleBeatsPanel: () => void
  setLastChapterId: (chapterId: string) => void
  setMapViewport: (viewport: { x: number; y: number; zoom: number }) => void
  toggleMapPalette: () => void
  setTheme: (theme: ThemeSetting) => void
  setProgressOpen: (open: boolean) => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      // Start with the sidebar closed on phones, where it covers the board.
      sidebarOpen: typeof window === 'undefined' || window.innerWidth > 760,
      sidebarMode: 'arcs',
      expandedArcs: {},
      lastArcId: null,
      highlight: null,
      editingBeatId: null,
      showArcColors: true,
      beatsPanelOpen: typeof window === 'undefined' || window.innerWidth > 760,
      lastChapterId: null,
      mapViewport: null,
      mapPaletteOpen: typeof window === 'undefined' || window.innerWidth > 760,
      theme: 'system',
      progressOpen: false,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarMode: (sidebarMode) => set({ sidebarMode }),
      toggleArc: (arcId) =>
        set((s) => ({ expandedArcs: { ...s.expandedArcs, [arcId]: !s.expandedArcs[arcId] } })),
      setLastArcId: (lastArcId) => set({ lastArcId }),
      setHighlight: (highlight) => set({ highlight }),
      openBeat: (editingBeatId) => set({ editingBeatId }),
      toggleArcColors: () => set((s) => ({ showArcColors: !s.showArcColors })),
      toggleBeatsPanel: () => set((s) => ({ beatsPanelOpen: !s.beatsPanelOpen })),
      setLastChapterId: (lastChapterId) => set({ lastChapterId }),
      setMapViewport: (mapViewport) => set({ mapViewport }),
      toggleMapPalette: () => set((s) => ({ mapPaletteOpen: !s.mapPaletteOpen })),
      setTheme: (theme) => set({ theme }),
      setProgressOpen: (progressOpen) => set({ progressOpen }),
    }),
    {
      name: 'story-builder:ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sidebarOpen: s.sidebarOpen,
        sidebarMode: s.sidebarMode,
        expandedArcs: s.expandedArcs,
        lastArcId: s.lastArcId,
        showArcColors: s.showArcColors,
        beatsPanelOpen: s.beatsPanelOpen,
        lastChapterId: s.lastChapterId,
        mapViewport: s.mapViewport,
        mapPaletteOpen: s.mapPaletteOpen,
        theme: s.theme,
      }),
    },
  ),
)
