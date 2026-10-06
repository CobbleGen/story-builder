import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'

interface Day {
  day: string
  words: number
}

interface Props {
  /** Oldest first; the last is today. */
  days: Day[]
  /** Daily goal, drawn as a line across the chart. */
  goal?: number
  /** What's counted ("Words written", "Outline words"). */
  what?: string
}

const PAD = { top: 20, right: 10, bottom: 24, left: 42 }
const PLOT_HEIGHT = 150
const MAX_BAR = 24
const RADIUS = 4

const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const toDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n < 0 ? `−${Math.abs(n).toLocaleString()}` : '0')

/** A round step for axis ticks: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(rough, 1)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * power >= rough) return m * power
  return 10 * power
}

/** A column from the baseline to `end`, rounded only at the data end. */
function columnPath(x: number, w: number, base: number, end: number): string {
  const r = Math.min(RADIUS, w / 2, Math.abs(base - end))
  if (end < base) {
    return `M${x},${base}V${end + r}Q${x},${end} ${x + r},${end}H${x + w - r}Q${x + w},${end} ${x + w},${end + r}V${base}Z`
  }
  return `M${x},${base}V${end - r}Q${x},${end} ${x + r},${end}H${x + w - r}Q${x + w},${end} ${x + w},${end - r}V${base}Z`
}

/** Words written each day, as columns; negative days (more cut than written) hang below the line. */
export function WordsChart({ days, goal, what = 'Words written' }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(520)
  const [active, setActive] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [asTable])

  const values = days.map((d) => d.words)
  const high = Math.max(10, goal ?? 0, ...values)
  const low = Math.min(0, ...values)
  const step = niceStep((high - low) / 3)
  const top = Math.ceil(high / step) * step
  const bottom = Math.floor(low / step) * step
  const plotWidth = Math.max(120, width - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + ((top - v) / (top - bottom)) * PLOT_HEIGHT
  const band = plotWidth / days.length
  // Bars never fill their slot: at most 24px, and always a gap of at least 2px.
  const barWidth = Math.max(2, Math.min(MAX_BAR, band - Math.max(2, band * 0.35)))
  const ticks: number[] = []
  for (let v = bottom; v <= top + 1e-9; v += step) ticks.push(Math.round(v))
  const lastIndex = days.length - 1
  const x = (i: number) => PAD.left + band * i + (band - barWidth) / 2
  const shown = active ?? null

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const from = active ?? lastIndex
      setActive(Math.max(0, Math.min(lastIndex, from + (e.key === 'ArrowLeft' ? -1 : 1))))
    } else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(lastIndex)
  }

  const total = values.reduce((a, b) => a + b, 0)

  return (
    <div className="words-chart">
      <div className="words-chart-head">
        <h3>
          {what}, last {days.length} days
        </h3>
        {goal && !asTable ? (
          <span className="chart-key">
            <span className="chart-key-line" aria-hidden />
            Daily goal · {goal.toLocaleString()}
          </span>
        ) : null}
        <button className="btn ghost small" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>
      {asTable ? (
        <div className="chart-table-wrap">
          <table className="chart-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Words</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{longDate.format(toDate(d.day))}</td>
                  <td>{signed(d.words)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={wrap}
          className="chart-plot"
          tabIndex={0}
          role="img"
          aria-label={`${what}: ${signed(total)} over the last ${days.length} days; today ${signed(values[lastIndex] ?? 0)}. Use the arrow keys to read each day.`}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
        >
          <svg width={width} height={PAD.top + PLOT_HEIGHT + PAD.bottom} aria-hidden>
            {ticks.map((t) => (
              <g key={t}>
                <line className={t === 0 ? 'chart-base' : 'chart-grid'} x1={PAD.left} x2={PAD.left + plotWidth} y1={y(t)} y2={y(t)} />
                <text className="chart-tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                  {t.toLocaleString()}
                </text>
              </g>
            ))}
            {days.map((d, i) =>
              d.words ? (
                <path
                  key={d.day}
                  className={`chart-bar${d.words < 0 ? ' negative' : ''}${shown === i ? ' active' : ''}`}
                  d={columnPath(x(i), barWidth, y(0), y(d.words))}
                />
              ) : null,
            )}
            {goal ? (
              <line className="chart-goal" x1={PAD.left} x2={PAD.left + plotWidth} y1={y(goal)} y2={y(goal)} />
            ) : null}
            {/* Only today's column carries its number; the rest are in the tooltip and the table. */}
            {values[lastIndex] ? (
              <text
                className="chart-value"
                x={x(lastIndex) + barWidth / 2}
                y={values[lastIndex] > 0 ? y(values[lastIndex]) - 5 : y(values[lastIndex]) + 13}
                textAnchor="middle"
              >
                {signed(values[lastIndex])}
              </text>
            ) : null}
            {days.map((d, i) => {
              const back = lastIndex - i
              if (back % 7 !== 0) return null
              return (
                <text key={d.day} className="chart-tick" x={x(i) + barWidth / 2} y={PAD.top + PLOT_HEIGHT + 17} textAnchor="middle">
                  {back === 0 ? 'Today' : shortDate.format(toDate(d.day))}
                </text>
              )
            })}
            {/* Hit areas: the whole column of each day, taller and wider than its bar. */}
            {days.map((d, i) => (
              <rect
                key={d.day}
                className="chart-hit"
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={PLOT_HEIGHT}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              />
            ))}
          </svg>
          {shown !== null && (
            <div
              className="chart-tooltip"
              style={{
                left: Math.max(60, Math.min(width - 60, x(shown) + barWidth / 2)),
                top: y(Math.max(0, values[shown])) - 10,
              }}
            >
              <strong>{signed(values[shown])} words</strong>
              <span>{longDate.format(toDate(days[shown].day))}</span>
              {values[shown] < 0 && <span>More cut than written</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
