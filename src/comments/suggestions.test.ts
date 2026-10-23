import { describe, expect, it } from 'vitest'
import type { RichNode } from '../types'
import { buildSampleStory } from '../store/sampleStory'
import { lookupOf, mentionToken } from '../lib/mentions'
import { docText, quoteIn } from './anchor'
import { targetOf, type CommentTarget } from './model'
import { fieldValue, fieldsFor, relink, suggestionView } from './suggestions'
import { suggestedChange, textWithChange } from './makeChange'

const p = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content })
const t = (text: string, marks?: RichNode['marks']): RichNode => (marks ? { type: 'text', text, marks } : { type: 'text', text })
const nameOf = (_id: string, label: unknown) => String(label ?? '')

describe('suggested changes', () => {
  it('are read with their comment’s target', () => {
    expect(targetOf({ kind: 'text', id: 'c', quote: 'old', suggest: { text: 'new' } })?.suggest).toEqual({ text: 'new' })
    expect(targetOf({ kind: 'beat', id: 'b', suggest: { field: 'title', from: 'A', to: 'B' } })?.suggest).toEqual({ field: 'title', from: 'A', to: 'B' })
    expect(targetOf({ kind: 'beat', id: 'b', suggest: { field: 'colour', to: 'B' } })?.suggest).toBeUndefined()
    expect(targetOf({ kind: 'story', suggest: { text: 'x' } })?.suggest).toBeUndefined()
  })

  it('change a passage’s words, keeping its marks, in the text as it is', async () => {
    const doc: RichNode = { type: 'doc', content: [p(t('The lamp went '), t('dark', [{ type: 'italic' }]), t(' and nobody spoke.')), p(t('Next.'))] }
    const anchor = quoteIn(docText(doc, nameOf), 'went dark')!.anchor
    const changed = await textWithChange(doc, anchor, 'guttered out', nameOf)
    expect(changed!.doc.content![0].content!.map((n) => n.text).join('')).toBe('The lamp guttered out and nobody spoke.')
    expect(changed!.words).toBe(8)
    // Cut, with nothing suggested in its place.
    const cut = await textWithChange(doc, quoteIn(docText(doc, nameOf), ' and nobody spoke.')!.anchor, '', nameOf)
    expect(cut!.doc.content![0].content!.map((n) => n.text).join('')).toBe('The lamp went dark')
    // Cut from the middle: one space left between the words either side.
    const middle = await textWithChange(doc, quoteIn(docText(doc, nameOf), 'and nobody')!.anchor, '', nameOf)
    expect(middle!.doc.content![0].content!.map((n) => n.text).join('')).toBe('The lamp went dark spoke.')
    // Words no longer as they were: not made.
    expect(await textWithChange(doc, { quote: 'a passage that is gone' }, 'x', nameOf)).toBeNull()
  })

  it('change a field, and say what they’d do', async () => {
    const data = buildSampleStory()
    const lookup = lookupOf([...data.characters, ...data.elements])
    const beat = Object.values(data.beats)[0]
    const target: CommentTarget = { kind: 'beat', id: beat.id, suggest: { field: 'title', from: beat.title, to: 'A better title' } }
    expect(fieldsFor(target, data).map((f) => f.field)).toEqual(['title', 'description', 'when'])
    expect(suggestionView(target, data, lookup, nameOf)).toMatchObject({ what: 'Title', to: 'A better title', ready: true })
    const change = await suggestedChange(data, target, lookup, nameOf)
    const next = change!(data)
    expect(next.beats[beat.id].title).toBe('A better title')
    expect(suggestionView(target, next, lookup, nameOf)).toMatchObject({ ready: false, note: 'It already reads like that.' })
    // A map note's text.
    const map = data.mindMaps[0]
    const note = map.nodes.find((n) => n.kind === 'note')!
    const onNote: CommentTarget = { kind: 'map', id: map.id, node: note.id, suggest: { field: 'text', from: '', to: 'Rewritten' } }
    expect(fieldsFor(onNote, data)).toEqual([{ field: 'text', label: 'Text' }])
    const noted = (await suggestedChange(data, onNote, lookup, nameOf))!(data)
    expect(fieldValue(onNote, 'text', noted)).toBe('Rewritten')
    // Never a field it doesn't have, or one a suggestion can't change (as a hand-made suggestion might say).
    const chapter = data.chapters[0]
    const odd: CommentTarget = { kind: 'chapter', id: chapter.id, suggest: { field: 'text', from: '', to: 'x' } }
    expect(suggestionView(odd, data, lookup, nameOf)).toMatchObject({ ready: false, note: 'That can’t be changed by a suggestion.' })
    expect(await suggestedChange(data, odd, lookup, nameOf)).toBeNull()
  })

  it('link names that were mentions again, in words written plainly', () => {
    const data = buildSampleStory()
    const lookup = lookupOf([...data.characters, ...data.elements])
    const mara = data.characters.find((c) => c.name === 'Mara')!
    const from = `${mentionToken(mara.id)} returns home.`
    expect(relink(from, 'Mara comes back home, and Mara cries.', lookup)).toBe(`${mentionToken(mara.id)} comes back home, and Mara cries.`)
    expect(relink(from, 'Nobody returns.', lookup)).toBe('Nobody returns.')
  })
})
