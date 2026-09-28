import type { StoryData } from '../types'
import { ARC_COLORS } from '../lib/colors'
import { addArc, addBeat, addChapter } from './storyOps'

const color = (name: string) => ARC_COLORS.find((c) => c.name === name)!.value

/** A small example story so the board has something to show on first visit. */
export function buildSampleStory(): StoryData {
  let data: StoryData = { title: 'The Lighthouse at Gull Point', chapters: [], arcs: [], beats: {} }

  const chapter = (title: string, summary: string) => {
    let id: string
    ;[data, id] = addChapter(data, { title, summary })
    return id
  }
  const arc = (name: string, colorName: string, description: string) => {
    let id: string
    ;[data, id] = addArc(data, { name, color: color(colorName), description })
    return id
  }
  const beat = (arcId: string, title: string, description: string, chapterId: string | null = null) => {
    ;[data] = addBeat(data, { arcId, title, description, chapterId })
  }

  const ch1 = chapter('The Storm', 'Mara returns to Gull Point the night the Aurelia goes down.')
  const ch2 = chapter('Wreckage', 'The village wakes to debris on the rocks and too many questions.')
  const ch3 = chapter('The Logbook', "Mara finds her father's hidden logbook.")
  const ch4 = chapter('Low Tide', '')

  const mystery = arc(
    'The missing ship',
    'Blue',
    'What really happened to the Aurelia, and who wanted it lost?',
  )
  const romance = arc('Mara & Theo', 'Pink', 'Old flames, old grudges.')
  const secret = arc('The keeper’s secret', 'Violet', "Mara's father has been lying for twenty years.")
  const village = arc('Village politics', 'Amber', 'The harbour council wants the lighthouse closed.')

  beat(mystery, 'The Aurelia signals from the reef', 'A flash of lantern light, then nothing.', ch1)
  beat(secret, 'The lamp goes dark', 'Father refuses to explain why the light failed.', ch1)
  beat(romance, 'Theo meets the bus', 'He is the last person Mara wanted to see.', ch1)
  beat(mystery, 'No bodies on the beach', 'Only cargo crates, all of them empty.', ch2)
  beat(village, 'Emergency council meeting', 'Harrow moves to decommission the lighthouse.', ch2)
  beat(romance, 'Argument on the pier', '', ch2)
  beat(secret, 'The locked drawer', 'Mara finds the logbook under a false bottom.', ch3)
  beat(mystery, 'Coordinates in the margin', 'The same reef, circled every year on the same night.', ch3)
  beat(village, 'Harrow buys the old boathouse', '', ch4)
  beat(mystery, 'A survivor in the sea caves', 'Someone was waiting for the tide to drop.')
  beat(romance, 'Theo admits he stayed for her', '')
  beat(secret, 'Father confesses', 'He has been guiding smugglers past the reef for years.')
  beat(village, 'The vote', 'The lighthouse is saved by a single voice.')

  return data
}

export function buildBlankStory(): StoryData {
  let data: StoryData = { title: 'Untitled story', chapters: [], arcs: [], beats: {} }
  ;[data] = addChapter(data, { title: '' })
  ;[data] = addArc(data, { name: 'Main plot', color: ARC_COLORS[6].value })
  return data
}
