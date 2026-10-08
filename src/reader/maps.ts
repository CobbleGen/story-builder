import type { MapEdge, MapNode, MindMap } from '../types'
import { displayName } from '../lib/mentions'
import { PAPER_NAMES, hexToHsv } from '../lib/colors'
import { NotFound, count, findByName, kindNoun, type Story } from './story'
import { clip } from './text'

// Mind maps: what's on each one (cards and groups, roughly from the top
// left), the lines between them, and what the lines say.

const LAYOUTS: Record<string, string> = {
  vertical: 'stacked in a column',
  horizontal: 'side by side in a row',
  grid: 'in a grid',
  free: 'placed freely',
}

const PAPERS = new Map(Object.entries(PAPER_NAMES).map(([name, hex]) => [hex, name]))

/** A colour in a word or two ("yellow", "pale blue"), so colour-coding reads. */
export function colourName(hex: string | undefined): string | null {
  if (!hex) return null
  const paper = PAPERS.get(hex.toLowerCase())
  if (paper) return paper
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null
  const { h, s, v } = hexToHsv(hex)
  if (v < 0.2) return 'black'
  if (s < 0.12) return v > 0.9 ? 'white' : 'grey'
  const hue = h < 15 ? 'red' : h < 40 ? 'orange' : h < 65 ? 'yellow' : h < 160 ? 'green' : h < 190 ? 'teal' : h < 250 ? 'blue' : h < 290 ? 'purple' : h < 335 ? 'pink' : 'red'
  return s < 0.3 ? `pale ${hue}` : hue
}

/** A card in a few words, to name it where a line meets it: “Mara (character)”, “note ‘What if…’”. */
export function cardLabel(story: Story, node: MapNode): string {
  switch (node.kind) {
    case 'character':
      return `${story.nameOf(node.refId)} (character)`
    case 'element': {
      const e = story.data.elements.find((x) => x.id === node.refId)
      return e ? `${displayName(e)} (${kindNoun(e)})` : 'a place or thing that was deleted'
    }
    case 'arc':
      return `arc “${story.arcName(story.arc(node.refId))}”`
    case 'chapter': {
      const c = story.chapter(node.refId)
      return c ? story.chapterName(c) : 'a chapter that was deleted'
    }
    case 'beat': {
      const b = story.data.beats[node.refId]
      return b ? `beat “${story.beatName(b)}”` : 'a beat that was deleted'
    }
    case 'note':
      return `note “${clip(story.plain(node.text), 70) || '(empty)'}”`
    case 'text':
      return `text “${clip(story.plain(node.text), 70) || '(empty)'}”`
    case 'image':
      return 'a picture'
    case 'container':
      return story.plain(node.title) ? `group “${clip(story.plain(node.title), 60)}”` : 'an untitled group'
  }
}

/** The spot inside a card a line is attached to, if it's not the card as a whole. */
function spotLabel(story: Story, node: MapNode, anchor: string | undefined): string {
  if (!anchor) return ''
  const [kind, id, ...rest] = anchor.split(':')
  if (kind === 'beat') {
    const b = story.data.beats[id]
    return b ? `, at its beat “${story.beatName(b)}”` : ''
  }
  if (kind === 'attr') {
    const owner = node.kind === 'character' ? story.data.characters.find((c) => c.id === node.refId) : node.kind === 'element' ? story.data.elements.find((e) => e.id === node.refId) : undefined
    const attribute = owner?.attributes.find((a) => a.id === id)
    return attribute ? `, at its “${attribute.label || 'Note'}” detail` : ''
  }
  if (kind === 'arc') return `, at arc “${story.arcName(story.arc(id))}”`
  if (kind === 'chapter') {
    const c = story.chapter(id)
    return c ? `, at chapter ${story.numberOf(c.id)}` : ''
  }
  if ((kind === 'para' || kind === 'item') && /^\d+$/.test(id) && rest.length) return `, at ${kind === 'para' ? 'paragraph' : 'item'} ${Number(id) + 1} of its text`
  return ''
}

/** A line between two cards: “Elias (character) → Mara (character): ‘father of’”. */
export function edgeLine(story: Story, nodes: Map<string, MapNode>, edge: MapEdge): string | null {
  const a = nodes.get(edge.source)
  const b = nodes.get(edge.target)
  if (!a || !b) return null
  const label = story.plain(edge.label ?? '')
  return `${cardLabel(story, a)}${spotLabel(story, a, edge.sourceAnchor)} ${edge.arrow ? '→' : '—'} ${cardLabel(story, b)}${spotLabel(story, b, edge.targetAnchor)}${label ? `: “${label}”` : ''}`
}

/** A note's or text box's text, as a list if it is one (ticked items marked). */
function noteText(story: Story, node: Extract<MapNode, { kind: 'note' | 'text' }>): string {
  const text = story.plain(node.text)
  if (!node.list) return text
  const ticked = new Set(node.checked ?? [])
  return text
    .split('\n')
    .map((line, i) => (node.list === 'check' ? `[${ticked.has(i) ? 'x' : ' '}] ${line}` : node.list === 'number' ? `${i + 1}. ${line}` : `• ${line}`))
    .join('\n')
}

/** A card as a list entry: what it is, and for notes and text boxes everything written on them. */
function cardEntry(story: Story, node: MapNode): string {
  switch (node.kind) {
    case 'note': {
      const colour = colourName(node.color)
      return `${colour ? `${colour} ` : ''}note: ${noteText(story, node) || '(empty)'}`
    }
    case 'text': {
      const big = (node.size ?? 0) >= 28 ? ' (large, like a heading)' : ''
      return `text${big}: ${noteText(story, node) || '(empty)'}`
    }
    case 'container': {
      const colour = colourName(node.color)
      return `${cardLabel(story, node)}, ${LAYOUTS[node.layout] ?? 'placed freely'}${colour ? `, ${colour}` : ''}, holding:`
    }
    default:
      return cardLabel(story, node)
  }
}

/** One map: its cards (those on a group under it), then its lines. */
export function describeMap(story: Story, map: MindMap): string {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]))
  const children = new Map<string | undefined, MapNode[]>()
  for (const n of map.nodes) {
    const parent = n.containerId && nodes.has(n.containerId) ? n.containerId : undefined
    children.set(parent, [...(children.get(parent) ?? []), n])
  }
  const lines: string[] = []
  const list = (parent: MapNode | undefined, depth: number) => {
    const kids = children.get(parent?.id) ?? []
    // Freely placed: top to bottom, left to right; stacked: in their order.
    const ordered = parent && parent.kind === 'container' && parent.layout !== 'free' ? kids : [...kids].sort((a, b) => a.y - b.y || a.x - b.x)
    for (const n of ordered) {
      lines.push(`${'  '.repeat(depth)}- ${cardEntry(story, n).replace(/\n/g, `\n${'  '.repeat(depth + 1)}`)}`)
      if (n.kind === 'container') list(n, depth + 1)
    }
  }
  list(undefined, 0)
  const edges = map.edges.map((e) => edgeLine(story, nodes, e)).filter((l): l is string => !!l)
  const out = [`## ${map.name || 'Untitled map'}`, `${count(map.nodes.length, 'card')} and ${count(edges.length, 'line')}.`]
  out.push(lines.length ? `### On the map (roughly from the top left)\n${lines.join('\n')}` : 'Nothing on it yet.')
  if (edges.length) out.push(`### Lines (→ has an arrowhead; — is a plain line)\n${edges.map((l) => `- ${l}`).join('\n')}`)
  return out.join('\n\n')
}

/** Every mind map, or one by name. */
export function mindMaps(story: Story, name?: string): string {
  const maps = story.data.mindMaps
  if (name?.trim()) {
    const map = findByName(maps, name, (m) => m.name, (m) => m.id)
    if (!map) throw new NotFound(`No mind map “${name}”. The maps are: ${maps.map((m) => `“${m.name || 'Untitled map'}”`).join(', ') || 'none'}.`)
    return `# Mind map in ${story.data.title.trim() || 'Untitled story'}\n\n${describeMap(story, map)}`
  }
  const intro = `# Mind maps in ${story.data.title.trim() || 'Untitled story'}\n\nFree-form boards where the writer lays out cards for story items (characters, places, arcs, chapters, beats), notes, text, pictures and groups, and draws lines between them.`
  return [intro, ...maps.map((m) => describeMap(story, m))].join('\n\n')
}

/** The lines on any map that touch a character's or element's card, in words. */
export function relationsOf(story: Story, id: string): string[] {
  const out: string[] = []
  for (const map of story.data.mindMaps) {
    const nodes = new Map(map.nodes.map((n) => [n.id, n]))
    const mine = new Set(map.nodes.filter((n) => (n.kind === 'character' || n.kind === 'element') && n.refId === id).map((n) => n.id))
    if (!mine.size) continue
    for (const e of map.edges) {
      if (!mine.has(e.source) && !mine.has(e.target)) continue
      const line = edgeLine(story, nodes, e)
      if (line) out.push(`${line} (on “${map.name || 'Untitled map'}”)`)
    }
    // Groups they're in, which say something about them too.
    for (const cardId of mine) {
      const group = nodes.get(nodes.get(cardId)?.containerId ?? '')
      if (group) out.push(`In ${cardLabel(story, group)} (on “${map.name || 'Untitled map'}”)`)
    }
  }
  return out
}
