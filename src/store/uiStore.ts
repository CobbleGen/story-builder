import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface UiState {
  sidebarOpen: boolean
  expandedArcs: Record<string, boolean>
  /** Arc preselected when adding a beat from a chapter. */
  lastArcId: string | null
  /** Arc whose beats are emphasised on the board (hovering it in the sidebar). */
  highlightArcId: string | null
  /** Beat open in the editor dialog. */
  editingBeatId: string | null
  toggleSidebar: () => void
  toggleArc: (arcId: string) => void
  setLastArcId: (arcId: string) => void
  setHighlightArc: (arcId: string | null) => void
  openBeat: (beatId: string | null) => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      // Start with the arcs panel closed on phones, where it covers the board.
      sidebarOpen: typeof window === 'undefined' || window.innerWidth > 760,
      expandedArcs: {},
      lastArcId: null,
      highlightArcId: null,
      editingBeatId: null,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleArc: (arcId) =>
        set((s) => ({ expandedArcs: { ...s.expandedArcs, [arcId]: !s.expandedArcs[arcId] } })),
      setLastArcId: (lastArcId) => set({ lastArcId }),
      setHighlightArc: (highlightArcId) => set({ highlightArcId }),
      openBeat: (editingBeatId) => set({ editingBeatId }),
    }),
    {
      name: 'story-builder:ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sidebarOpen: s.sidebarOpen, expandedArcs: s.expandedArcs, lastArcId: s.lastArcId }),
    },
  ),
)
