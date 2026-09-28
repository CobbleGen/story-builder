import { CircleDashed } from 'lucide-react'

interface Props {
  number: number | null | undefined
  title?: string
}

/** Chapter number badge for placed beats; a dashed "not placed" icon otherwise. */
export function ChapterTag({ number, title }: Props) {
  if (!number) {
    return (
      <span className="chapter-tag unplaced" title="Not in a chapter yet">
        <CircleDashed size={14} aria-label="Not in a chapter yet" />
      </span>
    )
  }
  return (
    <span className="chapter-tag" title={title ? `Chapter ${number}: ${title}` : `Chapter ${number}`}>
      {number}
    </span>
  )
}
