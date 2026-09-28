import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type SidebarMode = 'arcs' | 'characters'

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
  toggleSidebar: () => void
  setSidebarMode: (mode: SidebarMode) => void
  toggleArc: (arcId: string) => void
  setLastArcId: (arcId: string) => void
  setHighlight: (highlight: Highlight) => void
  openBeat: (beatId: string | null) => void
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
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarMode: (sidebarMode) => set({ sidebarMode }),
      toggleArc: (arcId) =>
        set((s) => ({ expandedArcs: { ...s.expandedArcs, [arcId]: !s.expandedArcs[arcId] } })),
      setLastArcId: (lastArcId) => set({ lastArcId }),
      setHighlight: (highlight) => set({ highlight }),
      openBeat: (editingBeatId) => set({ editingBeatId }),
    }),
    {
      name: 'story-builder:ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sidebarOpen: s.sidebarOpen,
        sidebarMode: s.sidebarMode,
        expandedArcs: s.expandedArcs,
        lastArcId: s.lastArcId,
      }),
    },
  ),
)
