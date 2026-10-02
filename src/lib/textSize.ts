// Text sizes on the mind map, in pixels at 100% zoom.

export const MIN_TEXT_SIZE = 6
export const MAX_TEXT_SIZE = 200
/** A sticky note's text until a size is set. */
export const NOTE_TEXT_SIZE = 14.5
/** A new text box's. */
export const TEXT_BOX_SIZE = 20

/** The sizes the smaller and larger buttons step through. */
const STEPS = [8, 10, 12, 14, 16, 18, 20, 24, 28, 34, 40, 48, 56, 64, 72, 96, 128, 160, 200]

/** The sizes text boxes had before any size could be set. */
const OLD_SIZES: Record<string, number> = { sm: 14, md: 20, lg: 34 }

/** A size within bounds, to a tenth of a pixel; undefined if it isn't a number. */
export function cleanTextSize(value: unknown): number | undefined {
  if (typeof value === 'string' && value in OLD_SIZES) return OLD_SIZES[value]
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.round(Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, value)) * 10) / 10
}

/** The next size up (1) or down (-1) from `size`. */
export function stepTextSize(size: number, direction: 1 | -1): number {
  const next = direction > 0 ? STEPS.find((s) => s > size) : [...STEPS].reverse().find((s) => s < size)
  return next ?? size
}

/**
 * How a text box looks at a size: plain text, then a bolder heading, then a
 * serif title (as the small, medium and large text boxes used to look).
 */
export const textLook = (size: number): 'body' | 'heading' | 'title' => (size >= 28 ? 'title' : size >= 18 ? 'heading' : 'body')
