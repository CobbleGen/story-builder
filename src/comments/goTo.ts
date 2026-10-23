import { useNavigate } from 'react-router-dom'
import { useUi } from '../store/uiStore'
import { closeComments } from './store'
import type { CommentThread } from './model'

// Going to what a comment is on: its page, card, beat or passage.

/** Shows what a thread is on: its page, card, beat or passage. */
export function useGoTo() {
  const navigate = useNavigate()
  const openBeat = useUi((s) => s.openBeat)
  return (thread: CommentThread) => {
    const t = thread.target
    const phone = window.matchMedia('(max-width: 720px)').matches
    if (phone) closeComments()
    switch (t.kind) {
      case 'story':
        return
      case 'text':
        return navigate(`/write/${t.id}`, { state: { comment: thread.id } })
      case 'chapter':
        return navigate('/', { state: { focusChapter: t.id } })
      case 'beat':
        return openBeat(t.id)
      case 'arc':
        return navigate(`/arcs/${t.id}`)
      case 'character':
        return navigate(`/characters/${t.id}`)
      case 'element':
        return navigate(`/elements/${t.id}`)
      case 'map':
        return navigate(`/map/${t.id}`, t.node ? { state: { focusNode: t.node } } : undefined)
    }
  }
}
