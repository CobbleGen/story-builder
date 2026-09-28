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

export type DragData = BeatDragData | ChapterDragData | UnassignDropData

export const chapterSortId = (id: string) => `chapter:${id}`
