import type { ElementKind, StoryData } from '../types'
import { ARC_COLORS, PAPER_NAMES } from '../lib/colors'
import type { NewMapNode } from './storyOps'
import {
  BOOK_END,
  BOOK_START,
  addArc,
  addBeat,
  addChapter,
  addCharacter,
  addElement,
  addMapEdge,
  addMapNode,
  addMindMap,
  emptyStory,
  linkMentions,
  placeOutlineStep,
  renameMindMap,
  setArcOutline,
  updateChapter,
  updateMapEdge,
} from './storyOps'

// The example story a first visit opens: Arthur Conan Doyle's "The Adventure
// of the Speckled Band" (1892, in the public domain), in seven chapters (the
// breaks are ours), with its storylines planned as arcs and beats. Most of
// the crime is told in flashback, and the narrator mentions at the start a
// death years after it, so story time and reading order differ a lot:
// backstory before the book begins, a flashback from the last chapter, an
// aftermath told first, and two beats in two arcs at the same moment.

const color = (name: string) => ARC_COLORS.find((c) => c.name === name)!.value

export const EXAMPLE_TITLE = 'The Adventure of the Speckled Band'

export function buildExampleStory(): StoryData {
  let data: StoryData = emptyStory(EXAMPLE_TITLE)

  const character = (name: string, colorName: string, description: string, attributes: [string, string][] = []) => {
    let id: string
    ;[data, id] = addCharacter(data, { name, color: color(colorName), description, attributes: attributes.map(([label, value]) => ({ label, value })) })
    return id
  }
  const element = (name: string, kind: ElementKind, colorName: string, description: string, attributes: [string, string][] = []) => {
    let id: string
    ;[data, id] = addElement(data, { name, kind, color: color(colorName), description, attributes: attributes.map(([label, value]) => ({ label, value })) })
    return id
  }
  const chapter = (title: string, summary: string, pov: string) => {
    let id: string
    ;[data, id] = addChapter(data, { title, summary })
    data = updateChapter(data, id, { povCharacterId: pov })
    return id
  }
  const arc = (name: string, colorName: string, description: string, characterIds: string[]) => {
    let id: string
    ;[data, id] = addArc(data, { name, color: color(colorName), description, characterIds })
    return id
  }
  const beat = (arcId: string, title: string, description: string, chapterId: string, when: string) => {
    let id: string
    ;[data, id] = addBeat(data, { arcId, title, description, chapterId, done: true })
    data = { ...data, beats: { ...data.beats, [id]: { ...data.beats[id], when } } }
    return id
  }

  // ---------- Who's in it ----------

  const holmes = character('Holmes', 'Slate', 'Sherlock Holmes, consulting detective, of 221B @Baker Street.', [
    ['Works', 'For the love of his art, not for money'],
    ['Habits', 'Up late as a rule; reads mud splashes and train tickets'],
  ])
  const watson = character('Watson', 'Bronze', 'Dr. John Watson, who shares rooms with @Holmes and tells the story, years later.', [
    ['Carries', 'His revolver, an Eley’s No. 2'],
  ])
  const helen = character('Helen Stoner', 'Pink', 'A young woman in black, grey before her time, who comes to @Holmes in terror.', [
    ['Age', 'Thirty'],
    ['Lives', 'At @Stoke Moran, with her stepfather'],
    ['Wants', 'To marry @Percy Armitage in the spring, and to live'],
    ['Fears', 'Whatever killed her sister'],
  ])
  const roylott = character('Dr. Roylott', 'Crimson', 'Dr. Grimesby Roylott, the last of the Roylotts of @Stoke Moran: a ruined family, a violent man.', [
    ['Was', 'A doctor in Calcutta, until he beat his butler to death'],
    ['Keeps', 'A cheetah and a baboon, loose in the grounds'],
    ['Wants', 'His late wife’s money, all of it'],
    ['Relationship', 'Stepfather of @Helen Stoner and @Julia Stoner'],
  ])
  const julia = character('Julia Stoner', 'Violet', 'Helen’s twin sister, who died two years ago, a fortnight before her wedding.', [
    ['Last words', '“It was the band! The speckled band!”'],
  ])
  const percy = character('Percy Armitage', 'Grass', 'The second son of Mr. Armitage, of Crane Water, near Reading.', [['Engaged to', '@Helen Stoner']])

  // ---------- Where it happens, and the clues ----------

  element('Baker Street', 'place', 'Slate', 'The rooms @Holmes and @Watson share, early in their friendship.')
  const stokeMoran = element('Stoke Moran', 'place', 'Bronze', 'The Roylotts’ old house on the western border of Surrey, half of it in ruins.', [
    ['Near', 'Leatherhead'],
    ['Who’s there', '@Dr. Roylott and @Helen Stoner; gipsies camp on the land'],
  ])
  const juliaRoom = element('Julia’s room', 'place', 'Violet', 'The middle bedroom of the west wing, where @Julia Stoner died; now @Helen Stoner sleeps there while the house is mended.')
  const roylottRoom = element('Dr. Roylott’s room', 'place', 'Crimson', 'Next to @Julia’s room: a camp-bed, a wooden chair, an iron safe.')
  element('Crown Inn', 'place', 'Amber', 'Across the road from @Stoke Moran: a window to watch the house from.')
  const bellPull = element('Bell-pull', 'object', 'Plum', 'A thick rope by the bed in @Julia’s room, put in two years ago.', [
    ['Rings', 'Nothing: it’s fastened to a hook above the ventilator'],
  ])
  const ventilator = element('Ventilator', 'object', 'Sky', 'A small opening high in the wall of @Julia’s room.', [['Opens into', '@Dr. Roylott’s room, not the open air']])
  const safe = element('Iron safe', 'object', 'Slate', 'In @Dr. Roylott’s room. “My stepfather’s business papers,” @Helen Stoner says.')
  const milk = element('Saucer of milk', 'object', 'Teal', 'On top of the @Iron safe. There’s no cat in the house.')
  const lash = element('Dog lash', 'object', 'Bronze', 'On the corner of @Dr. Roylott’s bed, its end tied in a loop.')
  const adder = element('Swamp adder', 'object', 'Amber', 'The deadliest snake in India: a yellow band with brownish speckles.', [
    ['Comes back to', 'A low whistle, and a saucer of milk'],
  ])
  const gipsies = element('Gipsies', 'group', 'Orange', 'Wanderers @Dr. Roylott lets camp on his land, and the first thing anyone suspects.')

  // ---------- The book, in seven chapters ----------

  const ch1 = chapter('Early in April', 'A lady in black, veiled and shaking, is waiting for @Holmes before breakfast.', watson)
  const ch2 = chapter('The Last of the Roylotts', '@Helen Stoner tells of her stepfather: India, her mother’s money, and the terror he has become.', watson)
  const ch3 = chapter('The Night Julia Died', 'The whistle in the night, the scream, and @Julia Stoner’s last words. And now @Helen Stoner has heard the whistle too.', watson)
  const ch4 = chapter('Holmes, the Meddler', '@Dr. Roylott follows her to @Baker Street; @Holmes finds what the will would cost him.', watson)
  const ch5 = chapter('Stoke Moran', 'The house, the three bedrooms, a bell-pull that rings nothing and a saucer of milk.', watson)
  const ch6 = chapter('The Vigil', 'A night in the dark in @Julia’s room, waiting for the whistle.', watson)
  const ch7 = chapter('The Speckled Band', 'What @Holmes and @Watson find in @Dr. Roylott’s room, and how it was done.', watson)

  // ---------- The storylines ----------

  const investigation = arc('Holmes investigates', 'Teal', 'From a frightened visitor at dawn to the truth about the speckled band.', [holmes, watson])
  const scheme = arc('Dr. Roylott’s scheme', 'Crimson', 'Money, a snake from India and a whistle: how one sister died, and the other was meant to.', [roylott])
  const sister = arc('Julia’s death', 'Violet', 'Two years ago, behind a locked door and barred shutters.', [julia, helen])
  const danger = arc('Helen in danger', 'Pink', 'Engaged, as her sister was, and sleeping in her sister’s bed.', [helen, percy])

  // Chapter 1: the narrator's note on why he can tell it now (years after), and the visitor.
  const freed = beat(danger, 'Free to tell it at last', 'The narrator promised to keep it secret; the lady’s untimely death has freed him to tell it.', ch1, 'Years later')
  const visitor = beat(danger, 'A visitor before breakfast', '@Helen Stoner, veiled and shaking, has come by dog-cart and the first train to see @Holmes.', ch1, 'Early April 1883, a quarter past seven')

  // Chapter 2: her stepfather's past.
  const calcutta = beat(scheme, 'A death in Calcutta', 'In a rage, @Dr. Roylott beats his butler to death, and serves a long term in prison.', ch2, 'Years before, in India')
  const married = beat(scheme, 'Married for her money', 'He marries the widowed Mrs. Stoner, whose money is his while her daughters live with him.', ch2, 'In India')
  const crewe = beat(scheme, 'Killed near Crewe', 'Mrs. Stoner dies in a railway accident, soon after they come home to @Stoke Moran.', ch2, 'Eight years ago')
  const terror = beat(scheme, 'The terror of the village', 'He quarrels, brawls and shuts himself away, with the @Gipsies on his land and a cheetah and a baboon in the grounds.', ch2, 'Since then')

  // Chapter 3: the night Julia died, and the whistle again.
  const engaged = beat(sister, 'Engaged at Christmas', '@Julia Stoner meets a half-pay major of marines at their aunt’s near Harrow, and they’re to marry.', ch3, 'Two years ago, at Christmas')
  const whistle = beat(sister, 'A whistle in the night', '@Julia Stoner asks @Helen Stoner whether she has heard it too: a low, clear whistle, at about three in the morning.', ch3, 'A fortnight before the wedding')
  const band = beat(sister, '“The speckled band!”', 'On a wild night: a scream, a whistle and a clang of metal. @Julia Stoner dies with those words, pointing at @Dr. Roylott’s room.', ch3, 'That night')
  const inquest = beat(sister, 'The coroner finds nothing', 'The door was locked and the shutters barred; there’s no mark of violence, and no poison.', ch3, 'Afterwards')
  const percyAsks = beat(danger, 'Engaged to Percy Armitage', '@Percy Armitage asks @Helen Stoner to marry him, and her stepfather has said nothing against it.', ch3, 'A month ago')
  const moved = beat(danger, 'In her sister’s bed', 'Repairs to the west wing put @Helen Stoner in @Julia’s room, in the bed her sister died in.', ch3, 'Two days ago')
  const again = beat(danger, 'The whistle again', 'Lying awake, she hears the low whistle that came before her sister’s death.', ch3, 'Last night')
  const takes = beat(investigation, 'Holmes takes the case', 'Five livid marks on her wrist; @Holmes will come to @Stoke Moran today, while @Dr. Roylott is in town.', ch3, 'That morning')

  // Chapter 4: the stepfather calls; the will.
  const calls = beat(scheme, 'The doctor calls', '@Dr. Roylott bursts in, warns @Holmes off, and bends the steel poker into a curve.', ch4, 'Minutes later')
  const poker = beat(investigation, 'The poker straightened', '@Holmes straightens it again with a sudden effort.', ch4, 'Minutes later')
  const will = beat(investigation, 'The will', 'At Doctors’ Commons: each daughter would take £250 a year on marrying. Motive enough.', ch4, 'That morning')

  // Chapter 5: the house.
  const dummy = beat(investigation, 'A bell-pull that rings no bell', 'The @Bell-pull hangs from a hook above the @Ventilator, which opens into @Dr. Roylott’s room; the bed is clamped to the floor.', ch5, 'That afternoon')
  const saucer = beat(investigation, 'A saucer of milk', 'In @Dr. Roylott’s room: the @Iron safe, the @Saucer of milk on top of it, and the @Dog lash tied in a loop.', ch5, 'That afternoon')

  // Chapter 6: the night watch.
  const lamp = beat(danger, 'The lamp in the window', 'When her stepfather has gone to bed, @Helen Stoner puts a lamp in the window for @Holmes and @Watson, watching from the @Crown Inn.', ch6, 'About eleven at night')
  const vigil = beat(investigation, 'Waiting in the dark', 'In @Julia’s room, without a light: the church clock strikes twelve, one, two, three.', ch6, 'Midnight to three')
  const lashes = beat(investigation, 'Holmes lashes at the bell-pull', 'At a low, clear whistle, @Holmes strikes a match and lashes at the @Bell-pull with his cane.', ch6, 'Just after three')
  const turns = beat(scheme, 'The snake turns on its master', 'Driven back through the @Ventilator, the @Swamp adder strikes the first person it sees. A horrible cry.', ch6, 'Just after three')

  // Chapter 7: what they find, and how it was done.
  const found = beat(investigation, 'The band round his brow', '@Dr. Roylott dead in his chair, a speckled band about his head. @Holmes noses it back into the @Iron safe with the @Dog lash.', ch7, 'Moments later')
  const aunt = beat(danger, 'To her aunt at Harrow', '@Helen Stoner goes to her aunt by the morning train; the inquiry finds the doctor died playing with a dangerous pet.', ch7, 'The next morning')
  const explains = beat(investigation, 'How it was done', 'The @Gipsies were a false scent; the @Ventilator, the @Bell-pull and the clamped bed gave it away.', ch7, 'The next day')
  // Told last of all, but it happened before Julia died: the longest flashback in the book.
  const trained = beat(scheme, 'A snake from India', '@Dr. Roylott trains the @Swamp adder to come back to a whistle, and to a saucer of milk, and sends it through the @Ventilator at night.', ch7, 'Before Julia’s death')

  // Story time: what's told in the visit to Baker Street happened long before it.
  const shared = 'moment_three_am'
  data = {
    ...data,
    beats: { ...data.beats, [lashes]: { ...data.beats[lashes], moment: shared }, [turns]: { ...data.beats[turns], moment: shared } },
    timeline: [
      calcutta,
      married,
      crewe,
      terror,
      trained,
      engaged,
      whistle,
      band,
      inquest,
      percyAsks,
      moved,
      again,
      BOOK_START,
      visitor,
      takes,
      calls,
      poker,
      will,
      dummy,
      saucer,
      lamp,
      vigil,
      lashes,
      turns,
      found,
      aunt,
      explains,
      BOOK_END,
      freed,
    ],
  }

  // The investigation laid over a mystery's structure, its steps on the beats they are (the crime is another
  // arc's, and nothing seems lost to Holmes).
  data = setArcOutline(data, investigation, 'mystery')
  for (const [step, beatId] of [
    ['crime', null],
    ['detective', takes],
    ['red-herring', takes],
    ['complication', poker],
    ['suspects', will],
    ['midpoint', dummy],
    ['key-clue', saucer],
    ['danger', vigil],
    ['all-lost', null],
    ['reveal', found],
    ['aftermath', explains],
  ] as const) {
    data = placeOutlineStep(data, investigation, step, beatId)
  }

  // ---------- Mind maps ----------

  const place = (node: NewMapNode, mapId?: string) => {
    let id: string | null
    ;[data, id] = addMapNode(data, node, mapId)
    return id!
  }
  const connect = (a: string, b: string, label: string) => {
    let id: string | null
    ;[data, id] = addMapEdge(data, a, b)
    if (id) data = updateMapEdge(data, id, { label })
  }

  // The clues, as Holmes put them together.
  data = renameMindMap(data, data.mindMaps[0].id, 'The clues')
  place({ kind: 'text', x: -60, y: -260, width: 420, text: 'How did Julia Stoner die?', size: 34 })
  const wing = place({ kind: 'container', x: -80, y: -150, width: 560, height: 220, title: 'The west wing', color: PAPER_NAMES.blue, layout: 'horizontal' })
  const nRoylottRoom = place({ kind: 'element', refId: roylottRoom, x: 0, y: 0, containerId: wing })
  const nJuliaRoom = place({ kind: 'element', refId: juliaRoom, x: 0, y: 0, containerId: wing })
  const nVentilator = place({ kind: 'element', refId: ventilator, x: 120, y: 200 })
  const nBell = place({ kind: 'element', refId: bellPull, x: 520, y: 220 })
  const nSafe = place({ kind: 'element', refId: safe, x: -360, y: 240 })
  const nMilk = place({ kind: 'element', refId: milk, x: -380, y: 470 })
  const nLash = place({ kind: 'element', refId: lash, x: -60, y: 520 })
  const nAdder = place({ kind: 'element', refId: adder, x: 200, y: 480 })
  const nGipsies = place({ kind: 'element', refId: gipsies, x: 620, y: 470 })
  const nRoylott = place({ kind: 'character', refId: roylott, x: -420, y: -40 })
  place({ kind: 'note', x: 640, y: -150, width: 220, height: 150, color: PAPER_NAMES.yellow, text: 'Why is the bed clamped to the floor?' })
  place({ kind: 'note', x: 640, y: 640, width: 220, height: 150, color: PAPER_NAMES.pink, text: '“The band”: a band of gipsies, and their spotted handkerchiefs? A false scent.' })
  connect(nVentilator, nRoylottRoom, 'opens into')
  connect(nVentilator, nJuliaRoom, 'high in the wall of')
  connect(nBell, nVentilator, 'hangs from just above')
  connect(nAdder, nBell, 'climbs down')
  connect(nSafe, nAdder, 'keeps')
  connect(nMilk, nAdder, 'feeds')
  connect(nLash, nAdder, 'handles')
  connect(nRoylott, nAdder, 'whistles back')
  connect(nGipsies, nAdder, 'not them')

  // Who's who.
  let whoMap: string
  ;[data, whoMap] = addMindMap(data, 'Who’s who')
  place({ kind: 'text', x: -40, y: -240, width: 300, text: 'Who’s who', size: 34 }, whoMap)
  const wHolmes = place({ kind: 'character', refId: holmes, x: -420, y: -60 }, whoMap)
  const wWatson = place({ kind: 'character', refId: watson, x: -440, y: 240 }, whoMap)
  const wHelen = place({ kind: 'character', refId: helen, x: 0, y: 0 }, whoMap)
  const wJulia = place({ kind: 'character', refId: julia, x: 360, y: 260 }, whoMap)
  const wRoylott = place({ kind: 'character', refId: roylott, x: 380, y: -120 }, whoMap)
  const wPercy = place({ kind: 'character', refId: percy, x: -60, y: 340 }, whoMap)
  const wHouse = place({ kind: 'element', refId: stokeMoran, x: 760, y: 60 }, whoMap)
  connect(wHelen, wHolmes, 'asks for help')
  connect(wWatson, wHolmes, 'friend of')
  connect(wRoylott, wHelen, 'stepfather of')
  connect(wRoylott, wJulia, 'stepfather of')
  connect(wJulia, wHelen, 'twin sister of')
  connect(wPercy, wHelen, 'engaged to')
  connect(wRoylott, wHouse, 'last of the Roylotts of')
  connect(wHolmes, wRoylott, 'up against')

  return linkMentions(data)
}
