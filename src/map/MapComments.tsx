import { MessageSquarePlus, Replace } from 'lucide-react'
import { reviewing } from '../review/mode'
import { useStory } from '../store/storyStore'
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
  // (An editor can suggest new words for a note, a text box or a group's title.)
  const words = useStory((s) => ['note', 'text', 'container'].includes(s.mindMaps.find((m) => m.id === mapId)?.nodes.find((n) => n.id === id)?.kind ?? ''))
  if (!on) return null
  return (
    <>
      <button className="map-tool" onClick={() => startComment({ kind: 'map', id: mapId, node: id })} title="Comment on this card">
        <MessageSquarePlus size={14} /> Comment
      </button>
      {reviewing && words && (
        <button className="map-tool" onClick={() => startComment({ kind: 'map', id: mapId, node: id }, true)} title="Suggest new words for this card">
          <Replace size={14} /> Suggest
        </button>
      )}
    </>
  )
}
