import { create } from 'zustand'

// The manuscript's find and replace panel: what's asked, and where. It stays
// as it is from chapter to chapter.

export type FindScope = 'chapter' | 'all'

interface FindPanelState {
  open: boolean
  text: string
  replacement: string
  matchCase: boolean
  wholeWord: boolean
  /** Where "Replace all", and going past the last match, reach: this chapter, or every one. */
  scope: FindScope
  /** The field to put the cursor in (n goes up to ask again). */
  focus: { field: 'find' | 'replace'; n: number }
  /** Arriving in another chapter from the panel: the match to go to there. */
  arrive: 'first' | 'last' | null
  /**
   * What the last "Replace all" did, said under the fields; done in every
   * chapter, the undo step it made (offered while it's still the latest).
   */
  notice: { text: string; step: object | null } | null
  set: (patch: Partial<Omit<FindPanelState, 'set' | 'show' | 'close'>>) => void
  /** Opens the panel (with this text to find, if any), the cursor in `field`. */
  show: (field: 'find' | 'replace', text?: string) => void
  close: () => void
}

export const useFind = create<FindPanelState>((set) => ({
  open: false,
  text: '',
  replacement: '',
  matchCase: false,
  wholeWord: false,
  scope: 'chapter',
  focus: { field: 'find', n: 0 },
  arrive: null,
  notice: null,
  set: (patch) => set(patch),
  show: (field, text) =>
    set((s) => ({ open: true, ...(text ? { text } : {}), focus: { field, n: s.focus.n + 1 }, notice: null })),
  close: () => set({ open: false, arrive: null, notice: null }),
}))
