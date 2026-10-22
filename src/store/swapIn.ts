import { askConfirm } from '../lib/confirm'
import { cloud } from '../cloud'
import { backupNow } from './persistence'
import { useStory } from './storyStore'

/**
 * Puts another story in place of the open one (blank, the example, an
 * import). Signed in, it's a new story in the account and the open one stays
 * there; otherwise it replaces this browser's story, with a backup kept.
 */
export async function swapInStory(data: unknown) {
  if (cloud && cloud.store.getState().user) {
    try {
      await cloud.newStory(data)
    } catch (error) {
      await askConfirm({ title: 'Couldn’t start the new story', message: error instanceof Error ? error.message : String(error), notice: true })
    }
    return
  }
  await backupNow()
  useStory.getState().replaceStory(data)
}
