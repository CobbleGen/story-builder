import type { RichNode } from '../types'
import { blocksOf, type Block, type Run } from '../lib/manuscript'
import { displayName } from '../lib/mentions'
import { BEAT_MARK, MENTION_NODE } from '../lib/richText'
import type { Story } from './story'

// A chapter's written text in words an assistant reads easily: light
// Markdown (italics, bold, headings, lists, quotes, scene breaks), names for
// mentions, and pictures noted where they stand.

/** About how much text one reply holds (some 10,000 tokens); longer chapters come in parts. */
export const PART_CHARS = 40_000

const nameFor = (story: Story) => (id: string, label: unknown) => {
  const named = story.lookup.get(id)
  return named ? displayName(named) : String(label ?? '')
}

/** Runs as light Markdown: *italic*, **bold**, ~~struck through~~ (spaces kept outside the marks). */
function runsText(runs: Run[]): string {
  return runs
    .map((r) => {
      const lead = r.text.match(/^\s*/)?.[0] ?? ''
      const trail = r.text.slice(lead.length).match(/\s*$/)?.[0] ?? ''
      let core = r.text.slice(lead.length, r.text.length - trail.length)
      if (!core) return r.text
      if (r.strike) core = `~~${core}~~`
      if (r.italic) core = `*${core}*`
      if (r.bold) core = `**${core}**`
      return lead + core + trail
    })
    .join('')
}

function blockText(b: Block): string {
  switch (b.type) {
    case 'break':
      return '* * *'
    case 'picture':
      return b.alt ? `[Picture: ${b.alt}]` : '[Picture]'
    case 'heading':
      return `${'#'.repeat(Math.min(6, b.level + 2))} ${runsText(b.runs)}`
    case 'item': {
      const pad = '  '.repeat(b.depth)
      return b.continued ? `${pad}  ${runsText(b.runs)}` : `${pad}${b.ordered ? `${b.number}.` : '-'} ${runsText(b.runs)}`
    }
    default:
      return b.quote ? runsText(b.runs).replace(/^/gm, '> '.repeat(b.quote)) : runsText(b.runs)
  }
}

/**
 * A chapter's text as paragraphs of light Markdown, in order (the items of a
 * list kept together as one); empty paragraphs left out.
 */
export function textParagraphs(doc: RichNode, story: Story): string[] {
  const out: string[] = []
  let lastList: number | null = null
  for (const block of blocksOf(doc, nameFor(story))) {
    const text = blockText(block)
    if (block.type === 'item') {
      if (lastList === block.list) out[out.length - 1] += `\n${text}`
      else out.push(text)
      lastList = block.list
      continue
    }
    lastList = null
    if (text.trim()) out.push(text)
  }
  return out
}

/** Paragraphs in parts of about `size` characters, split between paragraphs. */
export function splitParts(paragraphs: string[], size = PART_CHARS): string[][] {
  const parts: string[][] = [[]]
  let length = 0
  for (const p of paragraphs) {
    if (length > 0 && length + p.length > size) {
      parts.push([])
      length = 0
    }
    parts[parts.length - 1].push(p)
    length += p.length + 2
  }
  return parts
}

/** What an inline node reads as. */
function inlineText(node: RichNode, story: Story): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === MENTION_NODE) return nameFor(story)(String(node.attrs?.id ?? ''), node.attrs?.label)
  if (node.type === 'hardBreak') return ' '
  return (node.content ?? []).map((c) => inlineText(c, story)).join('')
}

/** The stretches of text the writer linked to beats, by beat id, as they read. */
export function linkedPassages(doc: RichNode, story: Story): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const walk = (node: RichNode) => {
    const inline = node.content ?? []
    if (!inline.some((c) => c.type === 'text' || c.type === MENTION_NODE)) {
      inline.forEach(walk)
      return
    }
    // A text block: neighbouring bits linked to the same beat make one passage.
    const runs: { beatId: string | null; text: string }[] = []
    for (const child of inline) {
      const mark = child.marks?.find((m) => m.type === BEAT_MARK)?.attrs?.beatId
      const beatId = typeof mark === 'string' ? mark : null
      const last = runs[runs.length - 1]
      if (last && last.beatId === beatId) last.text += inlineText(child, story)
      else runs.push({ beatId, text: inlineText(child, story) })
    }
    for (const run of runs) {
      if (run.beatId && run.text.trim()) out.set(run.beatId, [...(out.get(run.beatId) ?? []), run.text.trim()])
    }
  }
  walk(doc)
  return out
}

/** How many times each character or element is named (mentioned) in a text, by id. */
export function mentionCounts(doc: RichNode): Map<string, number> {
  const counts = new Map<string, number>()
  const walk = (node: RichNode) => {
    if (node.type === MENTION_NODE && typeof node.attrs?.id === 'string') counts.set(node.attrs.id, (counts.get(node.attrs.id) ?? 0) + 1)
    node.content?.forEach(walk)
  }
  walk(doc)
  return counts
}

/** The paragraphs that mention someone or something, as they read. */
export function paragraphsMentioning(doc: RichNode, id: string, story: Story): string[] {
  const out: string[] = []
  const walk = (node: RichNode) => {
    const inline = node.content ?? []
    if (inline.some((c) => c.type === MENTION_NODE && c.attrs?.id === id)) {
      out.push(inline.map((c) => inlineText(c, story)).join(''))
      return
    }
    inline.forEach(walk)
  }
  walk(doc)
  return out
}

/** Text cut to about `max` characters at a word break, with an ellipsis. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.lastIndexOf(' ', max)
  return `${flat.slice(0, cut > max * 0.6 ? cut : max).trimEnd()}…`
}
