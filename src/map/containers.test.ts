import { describe, expect, it } from 'vitest'
import type { MapNode } from '../types'
import { arrange, carryCards, planDrops } from './containers'
import type { StoryFlowNode } from './mapShared'

const flow = (node: MapNode, size = { width: 100, height: 50 }, extra: Partial<StoryFlowNode> = {}): StoryFlowNode => ({
  id: node.id,
  type: node.kind,
  position: { x: node.x, y: node.y },
  data: { node },
  measured: size,
  ...(node.kind === 'container' ? { width: node.width, height: node.height } : {}),
  ...extra,
})
const box = (layout: 'vertical' | 'horizontal' | 'free', x = 0, y = 0): MapNode => ({
  id: 'box',
  kind: 'container',
  x,
  y,
  width: 200,
  height: 100,
  color: 'blue',
  layout,
})
const note = (id: string, x: number, y: number, parentId?: string): MapNode => ({
  id,
  kind: 'note',
  x,
  y,
  width: 100,
  height: 50,
  text: id,
  color: 'yellow',
  ...(parentId ? { parentId } : {}),
})
const at = (nodes: StoryFlowNode[], id: string) => nodes.find((n) => n.id === id)!.position

describe('containers on the map', () => {
  it('stacks cards down a container and grows it to fit', () => {
    const nodes = arrange([flow(box('vertical', 10, 20)), flow(note('a', 500, 500, 'box')), flow(note('b', 0, 0, 'box'), { width: 260, height: 40 })])
    expect(at(nodes, 'a')).toEqual({ x: 26, y: 36 })
    expect(at(nodes, 'b')).toEqual({ x: 26, y: 98 })
    const c = nodes.find((n) => n.id === 'box')!
    expect([c.width, c.height]).toEqual([292, 134])
    expect(c.data.count).toBe(2)
  })

  it('stacks them side by side, leaves a dragged one be, and does nothing when all is in place', () => {
    const laid = arrange([flow(box('horizontal')), flow(note('a', 0, 0, 'box')), flow(note('b', 0, 0, 'box'))])
    expect([at(laid, 'a'), at(laid, 'b')]).toEqual([
      { x: 16, y: 16 },
      { x: 128, y: 16 },
    ])
    expect(arrange(laid)).toBe(laid)
    const dragging = laid.map((n) => (n.id === 'a' ? { ...n, position: { x: 400, y: 400 }, dragging: true } : n))
    expect(at(arrange(dragging), 'a')).toEqual({ x: 400, y: 400 })
  })

  it('carries the cards on a freeform container while it’s dragged, not while it’s resized', () => {
    const before = [flow(box('free')), flow(note('a', 30, 30, 'box')), flow(note('c', 300, 0))]
    const moved = before.map((n) => (n.id === 'box' ? { ...n, position: { x: 50, y: 10 } } : n))
    const carried = carryCards([{ type: 'position', id: 'box', position: { x: 50, y: 10 }, dragging: true }], before, moved)
    expect(at(carried, 'a')).toEqual({ x: 80, y: 40 })
    expect(at(carried, 'c')).toEqual({ x: 300, y: 0 })
    const resized = carryCards([{ type: 'position', id: 'box', position: { x: 50, y: 10 } }], before, moved)
    expect(at(resized, 'a')).toEqual({ x: 30, y: 30 })
  })

  it('works out where dropped cards go: onto a container under the pointer, in its stack, or off', () => {
    const nodes = arrange([flow(box('vertical')), flow(note('a', 0, 0, 'box')), flow(note('b', 0, 0, 'box')), flow(note('c', 400, 0))])
    const saved = nodes.map((n) => n.data.node)
    const drag = (id: string, x: number, y: number) => {
      const n = nodes.find((k) => k.id === id)!
      return { ...n, position: { x, y } }
    }
    // c dropped with the pointer just above b: it goes before b
    expect(planDrops(nodes, [drag('c', 20, 70)], saved, { id: 'c', point: { x: 40, y: 80 } })).toEqual([
      { id: 'c', x: 20, y: 70, parentId: 'box', before: 'b' },
    ])
    // a dragged out onto the board
    expect(planDrops(nodes, [drag('a', 700, 700)], saved, { id: 'a', point: { x: 720, y: 710 } })).toEqual([
      { id: 'a', x: 700, y: 700, parentId: null, before: undefined },
    ])
    // The container dragged: its cards are laid out where it lands
    const drops = planDrops(nodes, [drag('box', 100, 100)], saved)
    expect(drops).toEqual([
      { id: 'box', x: 100, y: 100 },
      { id: 'a', x: 116, y: 116 },
      { id: 'b', x: 116, y: 178 },
    ])
  })
})
