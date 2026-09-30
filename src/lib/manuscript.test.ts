import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import type { RichNode, StoryData } from '../types'
import { addChapter, addCharacter, emptyStory, mentionables, setChapterText } from '../store/storyOps'
import { buildSampleStory } from '../store/sampleStory'
import { lookupOf } from './mentions'
import { DEFAULT_EXPORT, aboutWords, blocksOf, buildManuscript, toMarkdown, toPlainText, toPrintHtml, type ExportOptions } from './manuscript'
import { manuscriptDocx } from './docxExport'

const t = (text: string, ...marks: string[]): RichNode => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) })
const p = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content })
const doc = (...content: RichNode[]): RichNode => ({ type: 'doc', content })

function story(): { data: StoryData; mara: string } {
  let data = emptyStory('The Test')
  let mara: string, one: string, two: string
  ;[data, mara] = addCharacter(data, { name: 'Mara', color: '#0a0' })
  ;[data, one] = addChapter(data, { title: 'Arrival' })
  ;[data] = addChapter(data, { title: 'Nothing yet' })
  ;[data, two] = addChapter(data, { title: '' })
  data = setChapterText(
    data,
    one,
    {
      doc: doc(
        p(t('It was '), t('dark', 'italic'), t(' and '), { type: 'mention', attrs: { id: mara } }, t(' was '), t('late', 'bold'), t('.')),
        p(t('She knocked.'), { type: 'hardBreak' }, t('Nobody came.')),
        { type: 'horizontalRule' },
        p(t('# not a heading')),
        { type: 'heading', attrs: { level: 2 }, content: [t('Later')] },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [
            { type: 'listItem', content: [p(t('rope')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('long'))] }] }] },
            { type: 'listItem', content: [p(t('lamp'))] },
          ],
        },
        { type: 'blockquote', content: [p(t('Keep the light burning.'))] },
      ),
      words: 30,
      updatedAt: 1,
    },
    null,
  )
  data = setChapterText(data, two, { doc: doc(p(t('The end.'))), words: 2, updatedAt: 1 }, null)
  return { data, mara }
}

const build = (data: StoryData, options: Partial<ExportOptions> = {}) =>
  buildManuscript(data, lookupOf(mentionables(data)), { ...DEFAULT_EXPORT, author: 'Ann Lee', ...options })

describe('manuscript export', () => {
  it('flattens a chapter into paragraphs, headings, list items and breaks', () => {
    const { data, mara } = story()
    const blocks = blocksOf(data.texts[data.chapters[0].id].doc, (id) => (id === mara ? 'Mara' : '?'))
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'break', 'paragraph', 'heading', 'item', 'item', 'item', 'paragraph'])
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      runs: [{ text: 'It was ' }, { text: 'dark', italic: true }, { text: ' and Mara was ' }, { text: 'late', bold: true }, { text: '.' }],
    })
    expect(blocks[1]).toMatchObject({ runs: [{ text: 'She knocked.\nNobody came.' }] })
    expect(blocks.slice(5, 8)).toMatchObject([
      { ordered: true, number: 3, depth: 0 },
      { ordered: false, depth: 1 },
      { ordered: true, number: 4, depth: 0 },
    ])
    expect(blocks[8]).toMatchObject({ quote: 1 })
  })

  it('takes the chapters asked for, with the headings asked for', () => {
    const { data } = story()
    const m = build(data)
    // The chapter with nothing written is left out; numbers stay the story's.
    expect(m.chapters.map((c) => [c.label, c.title])).toEqual([
      ['Chapter 1', 'Arrival'],
      ['Chapter 3', null],
    ])
    expect(m.words).toBe(32)
    expect(build(data, { skipEmpty: false }).chapters).toHaveLength(3)
    expect(build(data, { headings: 'title' }).chapters.map((c) => [c.label, c.title])).toEqual([
      [null, 'Arrival'],
      ['Chapter 3', null],
    ])
    expect(build(data, { headings: 'number' }).chapters[0]).toMatchObject({ label: 'Chapter 1', title: null })
    expect(aboutWords(12_345)).toBe('about 12,300 words')
    expect(aboutWords(1)).toBe('1 word')
  })

  it('writes plain text', () => {
    const { data } = story()
    const text = toPlainText(build(data))
    expect(text.startsWith('The Test\n\nby Ann Lee\n\n32 words\n\n\nChapter 1: Arrival\n\nIt was dark and Mara was late.\n\nShe knocked.\nNobody came.\n\n*  *  *\n\n# not a heading')).toBe(true)
    expect(text).toContain('3. rope\n\n    - long\n\n4. lamp\n\n    Keep the light burning.')
    expect(text.endsWith('Chapter 3\n\nThe end.\n')).toBe(true)
  })

  it('writes Markdown that reads back the same', () => {
    const { data } = story()
    const md = toMarkdown(build(data))
    expect(md).toContain('# The Test\n\n*by Ann Lee*\n\n32 words\n\n## Chapter 1: Arrival\n\nIt was *dark* and Mara was **late**.')
    expect(md).toContain('She knocked.\\\nNobody came.')
    expect(md).toContain('\\# not a heading')
    expect(md).toContain('### Later\n\n3. rope\n    - long\n4. lamp\n\n> Keep the light burning.')
    // Emphasis never starts or ends with a space.
    const m = build(data)
    m.chapters[0].blocks = [{ type: 'paragraph', runs: [{ text: 'a ' }, { text: ' b ', italic: true }, { text: '*c*' }] }]
    expect(toMarkdown(m)).toContain('a  *b* \\*c\\*')
  })

  it('lays out a page for printing', () => {
    const { data } = story()
    const html = toPrintHtml(build(data, { author: '<Ann>' }))
    expect(html).toContain('<p class="by">by &lt;Ann&gt;</p>')
    expect(html).toContain('<p class="flush">It was <em>dark</em> and Mara was <strong>late</strong>.</p>')
    expect(html).toContain('<p>She knocked.<br>Nobody came.</p>')
    expect(html).toContain('<h2 class="chapter"><span class="label">Chapter 1</span><span class="name">Arrival</span></h2>')
    // Without a title page the first chapter doesn't start on a fresh page.
    expect(toPrintHtml(build(data, { titlePage: false }))).toContain('<h2 class="chapter first">')
  })

  it('writes a Word document', async () => {
    const { data } = story()
    const blob = await manuscriptDocx(build(data))
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Arrival')
    expect(xml).toContain('Keep the light burning.')
    expect(xml).toContain('w:pageBreakBefore')
    expect(await zip.file('word/numbering.xml')!.async('string')).toContain('w:numFmt w:val="decimal"')
    const header = Object.keys(zip.files).find((f) => /word\/header\d+\.xml/.test(f) && f)
    expect(header).toBeDefined()
  })

  it('exports the example story', async () => {
    const data = buildSampleStory()
    const m = build(data)
    expect(m.chapters.map((c) => c.title)).toEqual(['The Logbook'])
    expect(toPlainText(m)).toContain('The keeper’s cottage had not changed')
    expect((await manuscriptDocx(m)).size).toBeGreaterThan(3000)
  })
})
