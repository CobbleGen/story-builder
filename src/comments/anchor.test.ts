import { describe, expect, it } from 'vitest'
import type { RichNode } from '../types'
import { anchorAt, docText, findAnchor, fold, quoteIn, quoteLine } from './anchor'

const p = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content })
const t = (text: string, marks?: RichNode['marks']): RichNode => (marks ? { type: 'text', text, marks } : { type: 'text', text })
const mention = (id: string): RichNode => ({ type: 'mention', attrs: { id, label: 'old name' } })
const doc = (...content: RichNode[]): RichNode => ({ type: 'doc', content })
const names: Record<string, string> = { mara: 'Mara' }
const nameOf = (id: string, label: unknown) => names[id] ?? String(label ?? '')

/** The text between two positions, as ProseMirror would give it (for checking positions). */
function between(d: RichNode, from: number, to: number): string {
  const text = docText(d, nameOf)
  let out = ''
  for (let i = 0; i < text.text.length; i++) if (text.from[i] >= from && text.to[i] <= to) out += text.text[i]
  return out
}

describe('a chapter’s text, with positions', () => {
  it('counts positions as ProseMirror does', () => {
    // <p>Hello</p><p>World</p>: "Hello" is 1–6, "World" is 8–13.
    const d = doc(p(t('Hello')), p(t('World')))
    const text = docText(d, nameOf)
    expect(text.text).toBe('Hello\nWorld')
    expect(text.from[0]).toBe(1)
    expect(text.to[4]).toBe(6)
    expect(text.from[6]).toBe(8)
    // An empty paragraph, a picture and a mention: one position for each leaf, two for an empty block.
    const mixed = doc(p(), { type: 'picture', attrs: { imageId: 'img_a' } }, p(t('By '), mention('mara'), t(' herself')))
    const m = docText(mixed, nameOf)
    // (Nothing before the first words: no line break.)
    expect(m.text).toBe('By Mara herself')
    // p() 0–2, picture 2–3, then the paragraph opens at 3: "By " is 4–7, the mention 7–8.
    expect(m.from[m.text.indexOf('B')]).toBe(4)
    expect(m.from[m.text.indexOf('M')]).toBe(7)
    expect(m.to[m.text.indexOf('a', 5)]).toBe(8)
    expect(m.from[m.text.indexOf('h')]).toBe(9)
  })

  it('goes into lists and quotes', () => {
    const d = doc({ type: 'bulletList', content: [{ type: 'listItem', content: [p(t('One'))] }, { type: 'listItem', content: [p(t('Two'))] }] }, { type: 'blockquote', content: [p(t('Said'))] })
    const text = docText(d, nameOf)
    expect(text.text).toBe('One\nTwo\nSaid')
    // ul 0, li 1, p 2: "One" 3–6; p and li close at 6 and 7; li 8, p 9: "Two" at 10.
    expect(text.from[0]).toBe(3)
    expect(text.from[4]).toBe(10)
  })
})

describe('finding a passage again', () => {
  const chapter = doc(
    p(t('The storm came in off the reef at dusk. ')),
    p(t('Mara watched the lamp. '), t('The lamp went dark', [{ type: 'italic' }]), t(' and nobody spoke.')),
    p(t('Later, the lamp went dark again, for good.')),
  )
  const text = docText(chapter, nameOf)

  it('keeps a selection’s words and what’s either side, and finds them where they were', () => {
    const from = text.from[text.text.indexOf('The lamp went dark')]
    const to = from + 'The lamp went dark'.length
    const anchor = anchorAt(text, from, to)!
    expect(anchor.quote).toBe('The lamp went dark')
    expect(anchor.prefix!.endsWith('Mara watched the lamp. ')).toBe(true)
    expect(anchor.suffix!.startsWith(' and nobody spoke.')).toBe(true)
    expect(findAnchor(text, anchor)).toEqual({ from, to, exact: true })
  })

  it('picks the repeat whose surroundings match', () => {
    const second = text.text.lastIndexOf('the lamp went dark')
    const from = text.from[second]
    const anchor = anchorAt(text, from, from + 18)!
    // Case doesn't matter: both are found, the second's surroundings win.
    expect(findAnchor(text, { ...anchor, quote: 'THE LAMP WENT DARK' })).toEqual({ from, to: from + 18, exact: true })
  })

  it('matches loosely: quotes, dashes, spaces, line breaks and Markdown', () => {
    const d = doc(p(t('“Don’t,” she said — and left.')), p(t('Next morning')))
    const dt = docText(d, nameOf)
    expect(findAnchor(dt, { quote: '"Don\'t," she said - and left. Next' })?.exact).toBe(true)
    expect(quoteIn(dt, '*she said*')?.anchor.quote).toBe('she said')
    expect(fold('  A\n\n b ').folded).toBe('a b ')
  })

  it('finds a passage whose words changed between what was before and after it', () => {
    const anchor = { quote: 'The lamp went dark', prefix: 'Mara watched the lamp. ', suffix: ' and nobody spoke.' }
    const changed = doc(p(t('Mara watched the lamp. '), t('The light guttered and failed'), t(' and nobody spoke.')))
    const found = findAnchor(docText(changed, nameOf), anchor)!
    expect(found.exact).toBe(false)
    expect(between(changed, found.from, found.to)).toBe('The light guttered and failed')
    // Gone altogether: not found.
    expect(findAnchor(docText(doc(p(t('Something else entirely.'))), nameOf), anchor)).toBeNull()
  })

  it('takes a quote an assistant read, as the chapter has it', () => {
    const found = quoteIn(text, 'the lamp went dark')!
    expect(found.times).toBe(2)
    expect(found.anchor.quote).toBe('The lamp went dark')
    expect(quoteIn(text, 'a sentence that isn’t there')).toBeNull()
    // Mentions read as names.
    const d = doc(p(t('Then '), mention('mara'), t(' laughed.')))
    expect(quoteIn(docText(d, nameOf), 'Mara laughed')?.anchor.quote).toBe('Mara laughed')
  })

  it('shows a long passage on one line, cut short', () => {
    expect(quoteLine('One\ntwo   three')).toBe('One two three')
    expect(quoteLine('word '.repeat(60), 30).length).toBeLessThanOrEqual(31)
  })
})

describe('positions, as the editor has them', () => {
  it('match a ProseMirror document’s', async () => {
    const { getSchema, Node: TipNode } = await import('@tiptap/core')
    const { default: StarterKit } = await import('@tiptap/starter-kit')
    const { Node: PmNode } = await import('@tiptap/pm/model')
    const Mention = TipNode.create({ name: 'mention', group: 'inline', inline: true, atom: true, addAttributes: () => ({ id: {}, label: {} }) })
    const Picture = TipNode.create({ name: 'picture', group: 'block', atom: true, addAttributes: () => ({ imageId: {} }) })
    const schema = getSchema([StarterKit, Mention, Picture])
    const d = doc(
      { type: 'heading', attrs: { level: 2 }, content: [t('Part one')] },
      p(t('By '), mention('mara'), t(' herself, '), t('quickly', [{ type: 'italic' }]), { type: 'hardBreak' }, t('then slow.')),
      p(),
      { type: 'picture', attrs: { imageId: 'img_a' } },
      { type: 'horizontalRule' },
      { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('One'))] }, { type: 'listItem', content: [p(t('Two'), mention('mara'))] }] },
      { type: 'blockquote', content: [p(t('“Said,” she said.'))] },
    )
    const pm = PmNode.fromJSON(schema, d)
    const text = docText(d, nameOf)
    for (let i = 0; i < text.text.length; i++) {
      if (text.from[i] === text.to[i]) continue // (the line break between blocks)
      const there = pm.textBetween(text.from[i], text.to[i], '', (leaf) => (leaf.type.name === 'mention' ? 'M' : leaf.type.name === 'hardBreak' ? '\n' : ''))
      expect(there === text.text[i] || (there === 'M' && /[Mara]/.test(text.text[i]))).toBe(true)
    }
    // And the last position is the document's end.
    expect(Math.max(...text.to)).toBeLessThanOrEqual(pm.content.size)
  })
})
