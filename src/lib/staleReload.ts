// A page left open across a new version of the app can't fetch the new
// version's parts (the manuscript, the map, loaded when first opened): it
// reloads to get them, once, rather than break.

const RELOADED = 'arc-creator:reloaded-for-update'

/** The new version's parts couldn't be fetched by a page from the old one. */
export const isStalePage = (error: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS/i.test(error instanceof Error ? error.message : String(error))

/** Reloads to get the newest version, unless that was just tried (and didn't help). */
export function reloadForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED) ?? 0)
    if (Date.now() - last < 30_000) return false
    sessionStorage.setItem(RELOADED, String(Date.now()))
  } catch {
    return false
  }
  location.reload()
  return true
}
