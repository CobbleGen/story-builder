/** Data attached to draggables and droppables on the chapter board. */
export interface BeatDragData {
  type: 'beat'
  beatId: string
  origin: 'board' | 'sidebar'
}

export interface ChapterDragData {
  type: 'chapter'
  chapterId: string
}

export interface UnassignDropData {
  type: 'unassign'
}

/** An arc in the sidebar: a beat dropped on it goes to that arc. */
export interface ArcDropData {
  type: 'arc'
  arcId: string
}

export type DragData = BeatDragData | ChapterDragData | UnassignDropData | ArcDropData

export const chapterSortId = (id: string) => `chapter:${id}`
