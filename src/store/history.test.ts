import { beforeEach, describe, expect, it } from 'vitest'
import { emptyStory, addChapter, setChapterText, updateChapter } from './storyOps'
import { remember, restore, travel, useHistory } from './history'
import type { StoryData } from '../types'

const doc = { type: 'doc', content: [] }

describe('undo history', () => {
  beforeEach(() => useHistory.setState({ past: [], future: [], notice: null }))

  it('groups typing in one field into one step, and undoes and redoes it', () => {
    let [data, ch] = addChapter(emptyStory(), { title: '' })
    const first = data
    for (const title of ['T', 'Th', 'The']) {
      remember(data, 'updateChapter', ch)
      data = updateChapter(data, ch, { title })
    }
    expect(useHistory.getState().past).toHaveLength(1)
    let current: StoryData = data
    travel('undo', current, (next) => (current = next))
    expect(current.chapters[0].title).toBe('')
    expect(current.chapters).toEqual(first.chapters)
    expect(useHistory.getState().notice?.text).toBe('Undid edit chapter')
    travel('redo', current, (next) => (current = next))
    expect(current.chapters[0].title).toBe('The')
  })

  it('keeps chapter text written since the copy, and the word log', () => {
    let [data, ch] = addChapter(emptyStory(), { title: 'One' })
    data = setChapterText(data, ch, { doc, words: 10, updatedAt: 1000 }, '2026-01-01')
    const copy = { ...data, chapters: data.chapters.map((c) => ({ ...c, title: 'Old' })) }
    // Written after the copy was taken (at 2000): kept.
    const later = setChapterText(data, ch, { doc, words: 50, updatedAt: 3000 }, '2026-01-01')
    const back = restore(copy, later, 2000)
    expect(back.chapters[0].title).toBe('Old')
    expect(back.texts[ch].words).toBe(50)
    expect(back.wordLog).toBe(later.wordLog)
    // Written before the copy: the copy's text wins.
    expect(restore(copy, later, 4000).texts[ch].words).toBe(10)
    // A chapter the copy doesn't have takes its text away with it.
    const [withTwo, ch2] = addChapter(later, { title: 'Two' })
    const withText = setChapterText(withTwo, ch2, { doc, words: 5, updatedAt: 5000 }, null)
    expect(restore(later, withText, 4500).texts).not.toHaveProperty(ch2)
  })
})
