// Arc Creator's mark: a thick ring in eight segments, like a story circle's
// eight steps (or an arc reactor), with even gaps between them. The favicon
// (public/favicon.svg) is the same ring, light on a dark tile.

const CENTRE = 12
const OUTER = 10.5
const INNER = 6
const GAP = 1.7

const at = (radius: number, angle: number) => `${+(CENTRE + radius * Math.sin(angle)).toFixed(3)} ${+(CENTRE - radius * Math.cos(angle)).toFixed(3)}`

/** One segment, between two gaps: along the outside clockwise, back along the inside. */
function segment(i: number): string {
  const start = (i * Math.PI) / 4
  const end = ((i + 1) * Math.PI) / 4
  // (Gaps as wide inside as out: each edge is set in by half a gap, measured straight across.)
  const outer = Math.asin(GAP / 2 / OUTER)
  const inner = Math.asin(GAP / 2 / INNER)
  return `M${at(OUTER, start + outer)}A${OUTER} ${OUTER} 0 0 1 ${at(OUTER, end - outer)}L${at(INNER, end - inner)}A${INNER} ${INNER} 0 0 0 ${at(INNER, start + inner)}Z`
}

const RING = Array.from({ length: 8 }, (_, i) => segment(i)).join('')

/** The mark, in the text's colour. */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={RING} />
    </svg>
  )
}
