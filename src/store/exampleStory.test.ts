import { describe, expect, it } from 'vitest'
import { timeJumps } from '../lib/timeline'
import { buildExampleStory, EXAMPLE_TITLE } from './exampleStory'
import { BOOK_END, BOOK_START, columnsOf, normalizeStory, readingOrder, storyOrder } from './storyOps'

describe('the example story', () => {
  const data = buildExampleStory()
  const beatNamed = (title: string) => Object.values(data.beats).find((b) => b.title === title)!

  it('is the Speckled Band, in seven chapters told by Watson', () => {
    expect(data.title).toBe(EXAMPLE_TITLE)
    expect(data.chapters.map((c) => c.title)).toEqual([
      'Early in April',
      'The Last of the Roylotts',
      'The Night Julia Died',
      'Holmes, the Meddler',
      'Stoke Moran',
      'The Vigil',
      'The Speckled Band',
    ])
    const watson = data.characters.find((c) => c.name === 'Watson')!
    expect(data.chapters.every((c) => c.povCharacterId === watson.id)).toBe(true)
    expect(data.arcs.map((a) => a.name)).toEqual(['Holmes investigates', 'Dr. Roylott’s scheme', 'Julia’s death', 'Helen in danger'])
  })

  it('places every beat in a chapter, with every name a link', () => {
    const beats = Object.values(data.beats)
    expect(beats).toHaveLength(27)
    expect(beats.every((b) => b.chapterId && data.chapters.find((c) => c.id === b.chapterId)!.beatIds.includes(b.id))).toBe(true)
    const texts = [
      ...beats.flatMap((b) => [b.title, b.description]),
      ...data.chapters.map((c) => c.summary),
      ...data.arcs.map((a) => a.description),
      ...[...data.characters, ...data.elements].flatMap((x) => [x.description, ...x.attributes.map((a) => a.value)]),
    ]
    expect(texts.filter((t) => t.includes('@') && !/@\{[^}]+\}/.test(t))).toEqual([])
    expect(texts.join(' ')).not.toMatch(/@(?!\{)/)
  })

  it('happens in another order than it’s told: backstory, a flashback, an aftermath and a moment two arcs share', () => {
    const story = storyOrder(data)
    const reading = readingOrder(data)
    const start = data.timeline.indexOf(BOOK_START)
    const end = data.timeline.indexOf(BOOK_END)
    const at = (title: string) => data.timeline.indexOf(beatNamed(title).id)
    // What Helen tells at Baker Street happened before the book begins; the narrator's freedom to tell it, after it ends.
    expect(at('A death in Calcutta')).toBeLessThan(start)
    expect(at('“The speckled band!”')).toBeLessThan(start)
    expect(at('The whistle again')).toBeLessThan(start)
    expect(at('A visitor before breakfast')).toBeGreaterThan(start)
    expect(at('Free to tell it at last')).toBeGreaterThan(end)
    // Told last of all, it happened before Julia's death.
    expect(reading.at(-1)).toBe(beatNamed('A snake from India').id)
    expect(at('A snake from India')).toBeLessThan(at('“The speckled band!”'))
    const jumps = timeJumps(story, reading)
    expect(jumps.get(beatNamed('A snake from India').id)).toBe('flashback')
    expect(jumps.get(beatNamed('Free to tell it at last').id)).toBe('flash-forward')
    // Holmes's lash and the snake turning back are one moment, in two arcs.
    const column = columnsOf(story, data.beats).find((c) => c.includes(beatNamed('Holmes lashes at the bell-pull').id))!
    expect(column).toContain(beatNamed('The snake turns on its master').id)
    expect(story).toHaveLength(27)
  })

  it('lays a mystery’s outline over the investigation, step by step', () => {
    const arc = data.arcs.find((a) => a.name === 'Holmes investigates')!
    expect(arc.outline?.kind).toBe('mystery')
    const step = (id: string) => data.beats[arc.outline!.steps[id]]?.title
    expect(step('detective')).toBe('Holmes takes the case')
    expect(step('key-clue')).toBe('A saucer of milk')
    expect(step('reveal')).toBe('The band round his brow')
    expect(arc.outline!.steps.crime).toBeUndefined()
  })

  it('has a map of the clues and one of who’s who', () => {
    expect(data.mindMaps.map((m) => m.name)).toEqual(['The clues', 'Who’s who'])
    const [clues, who] = data.mindMaps
    const wing = clues.nodes.find((n) => n.kind === 'container')!
    expect(clues.nodes.filter((n) => 'containerId' in n && n.containerId === wing.id)).toHaveLength(2)
    expect(clues.edges.length).toBeGreaterThanOrEqual(9)
    expect(clues.edges.every((e) => e.label)).toBe(true)
    expect(who.edges.length).toBeGreaterThanOrEqual(8)
  })

  it('comes through loading as it is', () => {
    expect(normalizeStory(data)).toEqual(data)
  })
})
