import type { ChapterStatus } from '../types'

export const STATUS_LABELS: Record<ChapterStatus, string> = {
  outline: 'Outline',
  draft: 'Draft',
  revised: 'Revised',
  done: 'Done',
}
