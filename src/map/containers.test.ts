import { describe, expect, it } from 'vitest'
import type { MapNode } from '../types'
import { TITLE_HEIGHT as T, arrange, planDrops } from './containers'
import type { StoryFlowNode } from './mapShared'

/** A card as React Flow has it: on the map at `at` (its own x and y when on nothing). */
const flow = (node: MapNode, size = { width: 100, height: 50 }, at?: { x: number; y: number }): StoryFlowNode => ({
  id: node.id,
  type: node.kind,
  position: at ?? { x: node.x, y: node.y },
  data: { node },
  measured: size,
  ...(node.kind === 'container' ? { width: node.width, height: node.height } : {}),
})
const box = (
  layout: 'vertical' | 'horizontal' | 'grid' | 'free',
  { id = 'box', x = 0, y = 0, width = 200, containerId }: { id?: string; x?: number; y?: number; width?: number; containerId?: string } = {},
): MapNode => ({
  id,
  kind: 'container',
  x,
  y,
  title: '',
  width,
  height: 100,
  color: '#c7dcf7',
  layout,
  ...(containerId ? { containerId } : {}),
})
const note = (id: string, x: number, y: number, containerId?: string): MapNode => ({
  id,
  kind: 'note',
  x,
  y,
  width: 100,
  height: 50,
  text: id,
  color: '#fbe7a1',
  ...(containerId ? { containerId } : {}),
})
const at = (nodes: StoryFlowNode[], id: string) => nodes.find((n) => n.id === id)!.position

describe('containers on the map', () => {
  it('stacks cards down a container, under its title, and grows it to fit', () => {
    const nodes = arrange([flow(box('vertical', { x: 10, y: 20 })), flow(note('a', 500, 500, 'box')), flow(note('b', 0, 0, 'box'), { width: 260, height: 40 })])
    expect(at(nodes, 'a')).toEqual({ x: 26, y: 20 + T })
    expect(at(nodes, 'b')).toEqual({ x: 26, y: 20 + T + 62 })
    const c = nodes.find((n) => n.id === 'box')!
    expect([c.width, c.height]).toEqual([292, T + 50 + 12 + 40 + 16])
    expect(c.data.count).toBe(2)
  })

  it('fits cards into a grid as wide as the container, and reflows when it’s resized', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => flow(note(id, 0, 0, 'box')))
    // 360 wide: (360 - 32 + 12) / (100 + 12) = 3 columns
    const wide = arrange([flow(box('grid', { width: 360 })), ...cards])
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => at(wide, id))).toEqual([
      { x: 16, y: T },
      { x: 128, y: T },
      { x: 240, y: T },
      { x: 16, y: T + 62 },
      { x: 128, y: T + 62 },
    ])
    const c = wide.find((n) => n.id === 'box')!
    expect([c.width, c.height]).toEqual([360, T + 128])
    // It can be made as narrow as one card, but no narrower
    expect(c.data.min).toEqual({ width: 132, height: T + 128 })
    // Resized narrower: two columns, three rows, and it grows taller
    const narrow = arrange(wide.map((n) => (n.id === 'box' ? { ...n, width: 250, resizing: true } : n)))
    expect(at(narrow, 'c')).toEqual({ x: 16, y: T + 62 })
    expect(at(narrow, 'e')).toEqual({ x: 16, y: T + 124 })
    expect(narrow.find((n) => n.id === 'box')!.height).toBe(T + 190)
  })

  it('stacks them side by side, leaves a dragged one be, and does nothing when all is in place', () => {
    const laid = arrange([flow(box('horizontal')), flow(note('a', 0, 0, 'box')), flow(note('b', 0, 0, 'box'))])
    expect([at(laid, 'a'), at(laid, 'b')]).toEqual([
      { x: 16, y: T },
      { x: 128, y: T },
    ])
    expect(arrange(laid)).toBe(laid)
    const dragging = laid.map((n) => (n.id === 'a' ? { ...n, position: { x: 400, y: 400 }, dragging: true } : n))
    expect(at(arrange(dragging), 'a')).toEqual({ x: 400, y: 400 })
  })

  it('keeps cards on a freeform container at their place from its corner, wherever it goes', () => {
    const nodes = [flow(box('free', { x: 50, y: 10 })), flow(note('a', 30, 30, 'box')), flow(note('c', 300, 0))]
    expect(at(arrange(nodes), 'a')).toEqual({ x: 80, y: 40 })
    // Dragged (React Flow moves the container): the card comes along
    const moved = nodes.map((n) => (n.id === 'box' ? { ...n, position: { x: 150, y: 110 }, dragging: true } : n))
    expect(at(arrange(moved), 'a')).toEqual({ x: 180, y: 140 })
    expect(at(arrange(moved), 'c')).toEqual({ x: 300, y: 0 })
    // Resized from its left edge: the card stays put until it's let go
    const resized = nodes.map((n) => (n.id === 'box' ? { ...n, position: { x: 20, y: 10 }, resizing: true } : n))
    expect(at(arrange(resized), 'a')).toEqual({ x: 80, y: 40 })
  })

  it('lays out containers on containers: inner sizes first, then places from the outside in', () => {
    const nodes = arrange([
      flow(box('vertical', { id: 'outer', x: 100, y: 100, width: 100 })),
      flow(box('vertical', { id: 'inner', width: 150, containerId: 'outer' })),
      flow(note('a', 0, 0, 'inner')),
      flow(note('b', 0, 0, 'inner')),
      flow(note('c', 0, 0, 'outer')),
    ])
    const inner = nodes.find((n) => n.id === 'inner')!
    // The inner one fits its two cards, and sits first on the outer one
    expect([inner.width, inner.height]).toEqual([150, T + 50 + 12 + 50 + 16])
    expect(at(nodes, 'inner')).toEqual({ x: 116, y: 100 + T })
    expect(at(nodes, 'a')).toEqual({ x: 132, y: 100 + 2 * T })
    expect(at(nodes, 'c')).toEqual({ x: 116, y: 100 + T + inner.height! + 12 })
    // The outer one grows around both
    const outer = nodes.find((n) => n.id === 'outer')!
    expect(outer.width).toBe(150 + 32)
  })

  it('works out where dropped cards go: onto a container under the pointer, in its stack, or off', () => {
    const nodes = arrange([flow(box('vertical')), flow(note('a', 0, 0, 'box')), flow(note('b', 0, 0, 'box')), flow(note('c', 400, 0))])
    const drag = (id: string, x: number, y: number) => ({ ...nodes.find((k) => k.id === id)!, position: { x, y } })
    // c dropped with the pointer just above b: it goes before b, its place saved from the container's corner
    expect(planDrops(nodes, [drag('c', 20, 70)], { id: 'c', point: { x: 40, y: T + 50 } })).toEqual([
      { id: 'c', x: 20, y: 70, containerId: 'box', before: 'b' },
    ])
    // a dragged out onto the board
    expect(planDrops(nodes, [drag('a', 700, 700)], { id: 'a', point: { x: 720, y: 710 } })).toEqual([
      { id: 'a', x: 700, y: 700, containerId: null, before: undefined },
    ])
    // The container dragged somewhere empty: it's just moved; what's on it stays on it
    expect(planDrops(nodes, [drag('box', 100, 100)], { id: 'box', point: { x: 110, y: 110 } })).toEqual([
      { id: 'box', x: 100, y: 100, containerId: null, before: undefined },
    ])
  })

  it('drops a container onto another, but never onto itself or what’s on it', () => {
    const nodes = arrange([
      flow(box('free', { id: 'big', x: 0, y: 0, width: 600 })),
      flow(box('free', { id: 'small', x: 700, y: 0 })),
      flow(box('free', { id: 'tiny', x: 10, y: T, containerId: 'small' })),
    ])
    const small = { ...nodes.find((n) => n.id === 'small')!, position: { x: 50, y: 60 } }
    expect(planDrops(nodes, [small], { id: 'small', point: { x: 60, y: 70 } })).toEqual([
      { id: 'small', x: 50, y: 60, containerId: 'big', before: undefined },
    ])
    // Over its own inner container: that doesn't count, so it goes on the map
    const tinyAt = at(nodes, 'tiny')
    const onItself = { ...nodes.find((n) => n.id === 'small')!, position: { x: 700, y: 0 } }
    expect(planDrops(nodes, [onItself], { id: 'small', point: { x: tinyAt.x + 5, y: tinyAt.y + 5 } })[0]).toMatchObject({ containerId: null })
  })

  it('slots a card dropped on a grid in by row, then by column', () => {
    const nodes = arrange([flow(box('grid', { width: 360 })), ...['a', 'b', 'c', 'd'].map((id) => flow(note(id, 0, 0, 'box'))), flow(note('x', 600, 0))])
    const x = { ...nodes.find((n) => n.id === 'x')!, position: { x: 100, y: 60 } }
    const slot = (point: { x: number; y: number }) => planDrops(nodes, [x], { id: 'x', point })[0].before
    expect(slot({ x: 140, y: T + 20 })).toBe('b') // left half of b, in the first row
    expect(slot({ x: 200, y: T + 20 })).toBe('c') // right half of b
    expect(slot({ x: 340, y: T + 20 })).toBe('d') // past the end of the first row
    expect(slot({ x: 200, y: T + 80 })).toBeNull() // after d, on the second row
  })
})
