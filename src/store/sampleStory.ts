import type { RichNode, StoryData } from '../types'
import { ARC_COLORS } from '../lib/colors'
import type { NewMapNode } from './storyOps'
import {
  addArc,
  addBeat,
  addChapter,
  addCharacter,
  addMapEdge,
  addMapNode,
  emptyStory,
  linkMentions,
  renameMindMap,
  setChapterText,
  updateChapter,
  updateMapEdge,
} from './storyOps'

const color = (name: string) => ARC_COLORS.find((c) => c.name === name)!.value

/**
 * A small example story so the board has something to show on first visit.
 * Text is written with plain `@Name` mentions; linkMentions turns them into
 * real character links at the end.
 */
export function buildSampleStory(): StoryData {
  let data: StoryData = emptyStory('The Lighthouse at Gull Point')

  const character = (
    name: string,
    colorName: string,
    description: string,
    attributes: [string, string][] = [],
  ) => {
    let id: string
    ;[data, id] = addCharacter(data, {
      name,
      color: color(colorName),
      description,
      attributes: attributes.map(([label, value]) => ({ label, value })),
    })
    return id
  }
  const chapter = (title: string, summary: string, pov: string | null = null) => {
    let id: string
    ;[data, id] = addChapter(data, { title, summary })
    if (pov) data = updateChapter(data, id, { povCharacterId: pov })
    return id
  }
  const arc = (name: string, colorName: string, description: string, characterIds: string[]) => {
    let id: string
    ;[data, id] = addArc(data, { name, color: color(colorName), description, characterIds })
    return id
  }
  const beat = (arcId: string, title: string, description: string, chapterId: string | null = null, done = false) => {
    let id: string
    ;[data, id] = addBeat(data, { arcId, title, description, chapterId, done })
    return id
  }

  const mara = character('Mara', 'Teal', 'The keeper’s daughter, back in Gull Point for the first time in ten years.', [
    ['Age', '29'],
    ['Occupation', 'Marine insurance investigator in Glasgow'],
    ['Wants', 'To sell the lighthouse and leave for good'],
    ['Fears', 'Turning into her father'],
  ])
  const theo = character('Theo', 'Orange', 'Harbour pilot. Stayed when everyone else left.', [
    ['Age', '31'],
    ['History', 'Engaged to @Mara before she left town'],
  ])
  const elias = character('Elias', 'Violet', 'Keeper of the Gull Point light for thirty years.', [
    ['Relationship', 'Father of @Mara'],
    ['Secret', 'Guides smugglers past the reef'],
  ])
  const harrow = character('Harrow', 'Amber', 'Chair of the harbour council.', [['Wants', 'The lighthouse land']])

  const ch1 = chapter('The Storm', '@Mara returns to Gull Point the night the Aurelia goes down.', mara)
  const ch2 = chapter('Wreckage', 'The village wakes to debris on the rocks and too many questions.', theo)
  const ch3 = chapter('The Logbook', '@Mara finds @Elias’s hidden logbook.', mara)
  const ch4 = chapter('Low Tide', '')

  const mystery = arc('The missing ship', 'Blue', 'What really happened to the Aurelia, and who wanted it lost?', [mara])
  const romance = arc('@Mara & @Theo', 'Pink', 'Old flames, old grudges.', [mara, theo])
  const secret = arc('The keeper’s secret', 'Plum', '@Elias has been lying for twenty years.', [elias, mara])
  const village = arc('Village politics', 'Bronze', 'The harbour council wants the lighthouse closed.', [harrow])

  beat(mystery, 'The Aurelia signals from the reef', 'A flash of lantern light, then nothing.', ch1)
  beat(secret, 'The lamp goes dark', '@Elias refuses to explain why the light failed.', ch1)
  beat(romance, '@Theo meets the bus', 'He is the last person @Mara wanted to see.', ch1)
  beat(mystery, 'No bodies on the beach', 'Only cargo crates, all of them empty.', ch2)
  beat(village, 'Emergency council meeting', '@Harrow moves to decommission the lighthouse.', ch2)
  beat(romance, 'Argument on the pier', '', ch2)
  const drawer = beat(secret, 'The locked drawer', '@Mara finds the logbook under a false bottom.', ch3, true)
  const margin = beat(mystery, 'Coordinates in the margin', 'The same reef, circled every year on the same night.', ch3, true)
  beat(village, '@Harrow buys the old boathouse', '', ch4)
  beat(mystery, 'A survivor in the sea caves', 'Someone was waiting for the tide to drop.')
  beat(romance, '@Theo admits he stayed for her', '')
  beat(secret, '@Elias confesses', 'He has been guiding smugglers past the reef for years.')
  beat(village, 'The vote', 'The lighthouse is saved by a single voice.')

  // Chapter 3 is already written, with its beats linked to the text.
  const text = (value: string, beatId?: string): RichNode => ({
    type: 'text',
    text: value,
    ...(beatId ? { marks: [{ type: 'beatLink', attrs: { beatId } }] } : {}),
  })
  const who = (id: string): RichNode => ({ type: 'mention', attrs: { id, label: null } })
  const para = (...content: (string | RichNode)[]): RichNode => ({
    type: 'paragraph',
    content: content.map((c) => (typeof c === 'string' ? text(c) : c)),
  })
  const logbook: RichNode = {
    type: 'doc',
    content: [
      para(
        'The keeper’s cottage had not changed, which was the worst thing about it. The same brass barometer, stuck on Change. The same kettle with the dent where ',
        who(mara),
        ' had dropped it at nine. Her father’s chair still faced the window, as if he were only out on the gallery and would be back for his tea.',
      ),
      para('She started with the desk, because the desk was where he had always told her not to look.'),
      para(
        text(
          'The bottom drawer stuck. When she forced it, it came out too easily, lighter than it should have been, and she saw why: someone had fitted a false floor, a plank of old ship’s timber cut to size.',
          drawer,
        ),
        ' Under it, wrapped in oilcloth, was a logbook with a green cover gone soft as moss.',
      ),
      para(
        'It was not the official log. That one lived in the watch room, all weather and lamp hours in her father’s square capitals. This one was written smaller, faster, in pencil.',
      ),
      para(
        'Most of the pages were tide times. Some were names she didn’t know; some were only initials. ',
        who(elias),
        ' had drawn a small fish beside a few of them, the way he used to draw them on her school lunches.',
      ),
      para(
        text(
          'And in the margin of every October, year after year, the same pair of numbers, circled twice.',
          margin,
        ),
        ' She didn’t need a chart. She had grown up with that reef outside her bedroom window.',
      ),
      para('The fourteenth of October. The night the Aurelia went down.'),
      { type: 'horizontalRule' },
      para(
        'She put the book inside her coat and sat for a long time in her father’s chair, watching the beam go round, trying to decide who she was going to show it to.',
      ),
    ],
  }
  const countWords = (node: RichNode): number =>
    node.type === 'text'
      ? (node.text?.match(/\S+/g)?.length ?? 0)
      : node.type === 'mention'
        ? 1
        : (node.content ?? []).reduce((n, c) => n + countWords(c), 0)
  data = setChapterText(data, ch3, { doc: logbook, words: countWords(logbook), updatedAt: Date.now() }, null)
  data = updateChapter(data, ch3, { status: 'draft', targetWords: 3000 })

  // A small mind map: who's who, and an open question.
  data = renameMindMap(data, data.mindMaps[0].id, 'Who knows what')
  const place = (node: NewMapNode) => {
    let id: string | null
    ;[data, id] = addMapNode(data, node)
    return id!
  }
  const connect = (a: string, b: string, label: string) => {
    let id: string | null
    ;[data, id] = addMapEdge(data, a, b)
    if (id) data = updateMapEdge(data, id, { label })
  }
  place({ kind: 'text', x: -40, y: -230, width: 360, text: 'Who knows what at Gull Point', size: 'lg' })
  const nMara = place({ kind: 'character', refId: mara, x: 0, y: 0 })
  const nTheo = place({ kind: 'character', refId: theo, x: 340, y: -40 })
  const nElias = place({ kind: 'character', refId: elias, x: -360, y: 40 })
  const nHarrow = place({ kind: 'character', refId: harrow, x: -250, y: 380 })
  const nSecret = place({ kind: 'arc', refId: secret, x: -700, y: 120 })
  const nLogbook = place({ kind: 'chapter', refId: ch3, x: -710, y: 470 })
  place({
    kind: 'note',
    x: 360,
    y: 250,
    width: 220,
    height: 150,
    color: 'yellow',
    text: 'What if @Theo already knows about the smuggling?',
  })
  connect(nElias, nMara, 'father of')
  connect(nMara, nTheo, 'old flame')
  connect(nHarrow, nElias, 'wants his lighthouse')
  connect(nElias, nSecret, 'hides')
  connect(nSecret, nLogbook, 'comes out in')

  return linkMentions(data)
}

export function buildBlankStory(): StoryData {
  let data: StoryData = emptyStory()
  ;[data] = addChapter(data, { title: '' })
  ;[data] = addArc(data, { name: 'Main plot', color: ARC_COLORS[6].value })
  return data
}
