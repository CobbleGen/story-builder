import { describe, expect, it } from 'vitest'
import type { RichNode } from '../types'
import { countInDoc, findIn, matcher, replaceInDoc, wordsInDoc } from './replace'
import { addChapter, emptyStory, replaceInText, setChapterText } from '../store/storyOps'
import { restore } from '../store/history'

const t = (text: string, marks?: RichNode['marks']): RichNode => (marks ? { type: 'text', text, marks } : { type: 'text', text })
const p = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content })
const doc = (...content: RichNode[]): RichNode => ({ type: 'doc', content })
const mention = (id: string): RichNode => ({ type: 'mention', attrs: { id, label: 'Theo' } })
const bold = [{ type: 'bold' }]
const q = (text: string, matchCase = false, wholeWord = false) => ({ text, matchCase, wholeWord })

describe('find and replace', () => {
  it('finds text as written: any case unless asked, whole words if asked', () => {
    const re = matcher(q('the'))!
    expect(findIn('The theory of the thing', re)).toEqual([[0, 3], [4, 7], [14, 17]])
    expect(findIn('The theory of the thing', matcher(q('the', true))!)).toEqual([[4, 7], [14, 17]])
    expect(findIn('The theory of the thing', matcher(q('the', false, true))!)).toEqual([[0, 3], [14, 17]])
    // Whole words: an apostrophe or a dash ends a word; accented letters don't
    expect(findIn('Theo’s boat; Theo-ish; Théo; Theodore', matcher(q('Theo', true, true))!)).toEqual([[0, 4], [13, 17]])
    // Nothing to find, and characters that mean something in a pattern taken as they are
    expect(matcher(q(''))).toBeNull()
    expect(findIn('Was it (really) 3.5?', matcher(q('(really) 3.5?'))!)).toEqual([[7, 20]])
  })

  it('replaces in saved text, keeping formatting, leaving linked names alone', () => {
    const before = doc(
      p(t('Gull '), t('Point', bold), t(' light at Gull Point.')),
      p(mention('chr_theo'), t(' rowed to Gull Point.')),
      { type: 'horizontalRule' },
      p(),
    )
    const re = matcher(q('gull point'))!
    expect(countInDoc(before, re)).toBe(3)
    const { doc: after, count } = replaceInDoc(before, re, 'the Point')
    expect(count).toBe(3)
    // The first match ran across plain and bold text: its replacement takes the plain formatting where it began
    expect(after.content![0].content).toEqual([t('the Point light at the Point.')])
    expect(after.content![1].content).toEqual([mention('chr_theo'), t(' rowed to the Point.')])
    expect(after.content!.slice(2)).toEqual(before.content!.slice(2))
    // A name linked with @ is not text: "Theo" isn't found in it
    expect(countInDoc(before, matcher(q('Theo'))!)).toBe(0)
    // Replaced with nothing: removed; nothing found: the same text back
    expect(replaceInDoc(doc(p(t('very very good'))), matcher(q('very '))!, '').doc).toEqual(doc(p(t('good'))))
    expect(replaceInDoc(before, matcher(q('nowhere'))!, 'x').doc).toBe(before)
    // Words counted as the editor counts them
    expect(wordsInDoc(before)).toBe(11)
    expect(wordsInDoc(after)).toBe(11)
  })

  it('replaces in every chapter as one change that undo brings back', () => {
    let [data, one] = addChapter(emptyStory(), { title: 'One' })
    let two: string
    ;[data, two] = addChapter(data, { title: 'Two' })
    data = setChapterText(data, one, { doc: doc(p(t('Theo ran. Theo fell.'))), words: 4, updatedAt: 100 }, null)
    data = setChapterText(data, two, { doc: doc(p(t('No one here.'))), words: 3, updatedAt: 100 }, null)
    const [next, done] = replaceInText(data, q('Theo', true, true), 'Theodore Vance', 500, '2026-10-22')
    expect(done).toEqual({ count: 2, chapters: 1 })
    expect(next.texts[one]).toEqual({ doc: doc(p(t('Theodore Vance ran. Theodore Vance fell.'))), words: 6, updatedAt: 500 })
    expect(next.texts[two]).toBe(data.texts[two])
    expect([next.wordLog, next.wordCuts]).toEqual([{ '2026-10-22': 2 }, {}])
    // Undo (the copy taken just after the stamp) brings the text back…
    expect(restore(data, next, 501).texts[one]).toBe(data.texts[one])
    // …unless it was written in since
    const later = setChapterText(next, one, { doc: doc(p(t('New.'))), words: 1, updatedAt: 900 }, null)
    expect(restore(data, later, 501).texts[one].words).toBe(1)
    // Nothing found: nothing changes
    expect(replaceInText(data, q('Zed'), 'x', 500)[0]).toBe(data)
    expect(replaceInText(data, q(''), 'x', 500)[0]).toBe(data)
  })
})
