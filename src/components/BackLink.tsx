import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useMentionLookup, useStory } from '../store/storyStore'
import { placeName, useBack } from '../lib/trail'

/** Back to the page you came from (named), as the browser's Back button would go; or to the chapter board if you started here. */
export function BackLink() {
  const { path, back } = useBack()
  const lookup = useMentionLookup()
  const name = useStory((s) => placeName(path ?? '/', s, lookup))
  return (
    <Link
      to={path ?? '/'}
      className="back-link"
      onClick={(e) => {
        // Opening it in a new tab or window is up to the browser.
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        back()
      }}
    >
      <ArrowLeft size={16} /> {name}
    </Link>
  )
}
