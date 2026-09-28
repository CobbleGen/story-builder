import type { StoryData } from '../types'
import { ARC_COLORS } from '../lib/colors'
import { addArc, addBeat, addChapter, addCharacter, linkMentions, updateChapter } from './storyOps'

const color = (name: string) => ARC_COLORS.find((c) => c.name === name)!.value

/**
 * A small example story so the board has something to show on first visit.
 * Text is written with plain `@Name` mentions; linkMentions turns them into
 * real character links at the end.
 */
export function buildSampleStory(): StoryData {
  let data: StoryData = { title: 'The Lighthouse at Gull Point', chapters: [], arcs: [], beats: {}, characters: [], texts: {} }

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
  const beat = (arcId: string, title: string, description: string, chapterId: string | null = null) => {
    ;[data] = addBeat(data, { arcId, title, description, chapterId })
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
  beat(secret, 'The locked drawer', '@Mara finds the logbook under a false bottom.', ch3)
  beat(mystery, 'Coordinates in the margin', 'The same reef, circled every year on the same night.', ch3)
  beat(village, '@Harrow buys the old boathouse', '', ch4)
  beat(mystery, 'A survivor in the sea caves', 'Someone was waiting for the tide to drop.')
  beat(romance, '@Theo admits he stayed for her', '')
  beat(secret, '@Elias confesses', 'He has been guiding smugglers past the reef for years.')
  beat(village, 'The vote', 'The lighthouse is saved by a single voice.')

  return linkMentions(data)
}

export function buildBlankStory(): StoryData {
  let data: StoryData = { title: 'Untitled story', chapters: [], arcs: [], beats: {}, characters: [], texts: {} }
  ;[data] = addChapter(data, { title: '' })
  ;[data] = addArc(data, { name: 'Main plot', color: ARC_COLORS[6].value })
  return data
}
