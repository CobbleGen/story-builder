import { MessageSquarePlus } from 'lucide-react'
import { CommentsOn } from '../components/Comments'
import { startComment, useCommentsOn } from '../comments/store'
import { useMap } from './mapShared'

// Comments on mind map cards: how many each has (in its corner, to open
// them), and a button in a card's toolbar to start one.

export function CardComments({ id }: { id: string }) {
  const { mapId } = useMap()
  return <CommentsOn kind="map" id={mapId} node={id} className="map-card-comments nodrag" />
}

export function CommentTool({ id }: { id: string }) {
  const { mapId } = useMap()
  const on = useCommentsOn()
  if (!on) return null
  return (
    <button className="map-tool" onClick={() => startComment({ kind: 'map', id: mapId, node: id })} title="Comment on this card">
      <MessageSquarePlus size={14} /> Comment
    </button>
  )
}
