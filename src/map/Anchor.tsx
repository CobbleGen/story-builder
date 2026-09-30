import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { anchorHandle } from '../lib/anchors'
import { useRefreshHandles } from './mapShared'

/**
 * Connection points for one row inside a card (a beat, an attribute, a
 * paragraph…): a line can start from either side of the row. Put it inside
 * the row, which carries `data-anchor` and the `map-anchor-row` class.
 * `ids[0]` is the row's own anchor; any others are saved anchors that now
 * lead here (a paragraph that moved, say). While the row is scrolled out of
 * sight its points go away, and its lines attach to the card instead.
 */
export function Anchor({ ids }: { ids: string[] }) {
  const refresh = useRefreshHandles()
  const marker = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(true)
  const key = ids.join(' ')

  useEffect(() => {
    const row = marker.current?.parentElement
    const scroller = row?.closest('.map-scroll')
    if (!row || !scroller) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: scroller,
      threshold: 0.5,
    })
    observer.observe(row)
    return () => observer.disconnect()
  }, [])

  // New, moved or vanished points need measuring before lines can find them.
  useLayoutEffect(() => {
    refresh()
    return refresh
  }, [key, visible, refresh])

  return (
    <span ref={marker} className="map-anchor" aria-hidden>
      {visible &&
        // The row's own anchor goes last, on top, so dragging from a point starts a line from it.
        [...ids].reverse().map((id) => (
          <Fragment key={id}>
            <Handle type="source" id={anchorHandle(id, 'l')} position={Position.Left} className="map-handle map-anchor-handle" />
            <Handle type="source" id={anchorHandle(id, 'r')} position={Position.Right} className="map-handle map-anchor-handle" />
          </Fragment>
        ))}
    </span>
  )
}
