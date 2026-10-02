let counter = 0

/** Short unique id. Avoids crypto.randomUUID, which is missing outside secure contexts. */
export function makeId(prefix: string): string {
  counter = (counter + 1) % 1296
  const time = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${time}${counter.toString(36).padStart(2, '0')}${rand}`
}

/** Picture ids, as they appear in the story (pictures themselves are stored apart). */
export const IMAGE_ID = /^img_[a-z0-9]+$/
