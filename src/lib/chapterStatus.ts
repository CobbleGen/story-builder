import type { Chapter, ChapterStatus } from '../types'

export const STATUS_LABELS: Record<ChapterStatus, string> = {
  outline: 'Outline',
  draft: 'Draft',
  revised: 'Revised',
  done: 'Done',
  shelved: 'Shelved',
}

/** Set aside for now: kept, but left out of the book's word count and export. */
export const isShelved = (c: Pick<Chapter, 'status'>) => c.status === 'shelved'
