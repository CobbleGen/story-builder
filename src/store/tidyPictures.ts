import { pickData, useStory } from './storyStore'
import { readSavedStory } from './persistence'
import { listBackups } from './backups'
import { useHistory } from './history'
import { pruneImages } from './images'

/**
 * Once the app has settled, deletes pictures that nothing uses any more:
 * not the story, any backup, or anything undo could bring back.
 */
export function tidyPicturesSoon() {
  const run = () =>
    void pruneImages(async () => {
      const keep = [JSON.stringify(pickData(useStory.getState()))]
      const saved = await readSavedStory()
      if (saved) keep.push(saved)
      for (const backup of await listBackups()) keep.push(backup.raw)
      const { past, future } = useHistory.getState()
      for (const entry of [...past, ...future]) keep.push(JSON.stringify(entry.data))
      return keep
    }).catch(() => {})
  setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(run) : run()), 15_000)
}
