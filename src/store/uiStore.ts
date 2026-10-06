import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_EXPORT, type ExportOptions } from '../lib/manuscript'

export type SidebarMode = 'arcs' | 'characters' | 'world'
/** The timeline in the order things happen, or in the order they're read. */
export type TimelineMode = 'story' | 'reading'
/** Light or dark colours, or whichever the device is set to. */
export type ThemeSetting = 'system' | 'light' | 'dark'

export interface MapViewport {
  x: number
  y: number
  zoom: number
}

/** What the board is emphasising (hovering an arc, character or element in the sidebar). */
export type Highlight = { kind: 'arc' | 'character' | 'element'; id: string } | null

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
  /** Where each mind map was last scrolled and zoomed to, by map id. */
  mapViewports: Record<string, MapViewport>
  /** The mind map last opened. */
  lastMapId: string | null
  /** Mind map: the "add to map" panel is open. */
  mapPaletteOpen: boolean
  theme: ThemeSetting
  /** The word count and goals dialog is open. */
  progressOpen: boolean
  /** The search dialog is open. */
  searchOpen: boolean
  /** How the manuscript was last exported. */
  exportOptions: ExportOptions
  timelineMode: TimelineMode
  /** Colours picked lately, the latest first (empty until one is picked). */
  recentColors: string[]
  toggleSidebar: () => void
  setSidebarMode: (mode: SidebarMode) => void
  toggleArc: (arcId: string) => void
  setLastArcId: (arcId: string) => void
  setHighlight: (highlight: Highlight) => void
  openBeat: (beatId: string | null) => void
  toggleArcColors: () => void
  toggleBeatsPanel: () => void
  setLastChapterId: (chapterId: string) => void
  setMapViewport: (mapId: string, viewport: MapViewport) => void
  setLastMapId: (mapId: string) => void
  toggleMapPalette: () => void
  setTheme: (theme: ThemeSetting) => void
  setProgressOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setExportOptions: (patch: Partial<ExportOptions>) => void
  setTimelineMode: (mode: TimelineMode) => void
  /** Puts a picked colour first among the recent ones; `shown` are the ones on show until any is picked. */
  rememberColor: (color: string, shown: string[]) => void
}

const RECENT_COLORS = 12

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
      mapViewports: {},
      lastMapId: null,
      mapPaletteOpen: typeof window === 'undefined' || window.innerWidth > 760,
      theme: 'system',
      progressOpen: false,
      searchOpen: false,
      exportOptions: DEFAULT_EXPORT,
      timelineMode: 'story',
      recentColors: [],
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
      setMapViewport: (mapId, viewport) => set((s) => ({ mapViewports: { ...s.mapViewports, [mapId]: viewport } })),
      setLastMapId: (lastMapId) => set({ lastMapId }),
      toggleMapPalette: () => set((s) => ({ mapPaletteOpen: !s.mapPaletteOpen })),
      setTheme: (theme) => set({ theme }),
      setProgressOpen: (progressOpen) => set({ progressOpen }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setExportOptions: (patch) => set((s) => ({ exportOptions: { ...s.exportOptions, ...patch } })),
      setTimelineMode: (timelineMode) => set({ timelineMode }),
      rememberColor: (color, shown) =>
        set((s) => {
          const was = s.recentColors.length ? s.recentColors : shown
          return { recentColors: [color, ...was.filter((c) => c !== color)].slice(0, RECENT_COLORS) }
        }),
    }),
    {
      name: 'story-builder:ui',
      storage: createJSONStorage(() => localStorage),
      // From before several maps: the one map's view is the first map's.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<UiState> & { mapViewport?: MapViewport | null }
        const { mapViewport, ...rest } = saved
        const mapViewports = rest.mapViewports ?? (mapViewport ? { map_main: mapViewport } : {})
        const exportOptions = { ...DEFAULT_EXPORT, ...rest.exportOptions }
        return { ...current, ...rest, mapViewports, exportOptions }
      },
      partialize: (s) => ({
        sidebarOpen: s.sidebarOpen,
        sidebarMode: s.sidebarMode,
        expandedArcs: s.expandedArcs,
        lastArcId: s.lastArcId,
        showArcColors: s.showArcColors,
        beatsPanelOpen: s.beatsPanelOpen,
        lastChapterId: s.lastChapterId,
        mapViewports: s.mapViewports,
        lastMapId: s.lastMapId,
        mapPaletteOpen: s.mapPaletteOpen,
        theme: s.theme,
        exportOptions: s.exportOptions,
        timelineMode: s.timelineMode,
        recentColors: s.recentColors,
      }),
    },
  ),
)
