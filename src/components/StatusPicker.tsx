import { ChevronDown } from 'lucide-react'
import type { Chapter, ChapterStatus } from '../types'
import { useStory } from '../store/storyStore'
import { CHAPTER_STATUSES } from '../store/storyOps'
import { STATUS_LABELS } from '../lib/chapterStatus'

/** A chapter's status (outline, draft, revised, done), as a small coloured pill to change it. */
export function StatusPicker({ chapter }: { chapter: Chapter }) {
  const updateChapter = useStory((s) => s.updateChapter)
  return (
    <label className={`status-pill status-${chapter.status}`} title="How far along this chapter is">
      <span className="status-dot" aria-hidden />
      <select
        value={chapter.status}
        onChange={(e) => updateChapter(chapter.id, { status: e.target.value as ChapterStatus })}
        aria-label="Chapter status"
      >
        {CHAPTER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="status-chevron" aria-hidden />
    </label>
  )
}
