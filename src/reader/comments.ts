import type { CommentTarget, CommentThread, StoryComment } from '../comments/model'
import { commentOf, describeTarget, draftOf, inDraft, cardName, labelFor, threadsOf } from '../comments/model'
import { docText, findAnchor, quoteIn, quoteLine } from '../comments/anchor'
import { displayName } from '../lib/mentions'
import { NotFound, count, findByName, findChapter, chapterList, type Story } from './story'

// The comments on a story, in words, for an AI assistant acting as its
// editor: what each is on (quoting the passage), who said what, and whether
// it's resolved; and what an assistant names to comment on (a chapter and
// the words it quotes from it, a beat, an arc, a character…) as a target.

const nameFor = (story: Story) => (id: string, label: unknown) => {
  const named = story.lookup.get(id)
  return named ? displayName(named) : String(label ?? '')
}

const who = (c: StoryComment) => {
  const name = c.author.name.trim()
  if (c.mine) return `you (${name || 'AI assistant'})`
  if (c.author.kind === 'writer') return name ? `${name}, the writer` : 'the writer'
  if (c.author.kind === 'assistant') return `${name || 'AI assistant'} (an AI assistant)`
  return `${name || 'An editor'} (editor)`
}

const day = (iso: string) => (iso ? iso.slice(0, 16).replace('T', ' ') : '')

/** Whether a passage's words are as they were when commented on. */
function passageNote(story: Story, t: CommentTarget): string {
  if (t.kind !== 'text') return ''
  const text = story.data.texts[t.id]
  if (!text) return ' (the chapter has no text now)'
  const found = findAnchor(docText(text.doc, nameFor(story)), t)
  return !found ? ' (those words aren’t in the chapter any more)' : found.exact ? '' : ' (the words there have changed since)'
}

function threadText(story: Story, t: CommentThread): string {
  const { label, gone } = describeTarget(t.target, story.data, story.lookup)
  const lines = [`- Comment ${t.id}${t.resolved ? ' (resolved)' : ''}, on ${label}${gone ? ' (no longer in the story)' : ''}`]
  if (t.target.kind === 'text') lines.push(`  On the words: “${quoteLine(t.target.quote, 300)}”${passageNote(story, t.target)}`)
  for (const c of [t.first, ...t.replies]) lines.push(`  ${c === t.first ? '' : '↳ '}${who(c)}, ${day(c.createdAt)}: ${c.body.replace(/\n+/g, ' / ')}`)
  if (t.resolved && t.first.resolvedBy !== null) lines.push(`  Resolved${t.first.resolvedBy ? ` by ${t.first.resolvedBy}` : ''}, ${day(t.first.resolvedAt ?? '')}.`)
  return lines.join('\n')
}

/** Where a thread is listed: the story, a chapter (with its passages), or one of the other kinds. */
function groupOf(story: Story, t: CommentTarget): string {
  switch (t.kind) {
    case 'story':
      return 'The whole story'
    case 'chapter':
    case 'text': {
      const c = story.chapter(t.id)
      return c ? story.chapterName(c) : 'Chapters no longer in the story'
    }
    case 'beat':
      return 'Beats'
    case 'arc':
      return 'Arcs'
    case 'character':
      return 'Characters'
    case 'element':
      return 'Places, objects and groups'
    case 'map':
      return 'Mind maps'
  }
}

/** Comment rows as the account keeps them, in threads. */
export const threadsFrom = (rows: Record<string, unknown>[]) => threadsOf(rows.map(commentOf).filter((c): c is StoryComment => !!c))

/**
 * The comments on the story (the draft being read, and what every draft
 * shares), open ones or all; in the order of the story: the story as a whole,
 * chapter by chapter, then beats, arcs, characters, places and mind maps.
 */
export function comments(story: Story, rows: Record<string, unknown>[], options: { resolved?: boolean; chapter?: string } = {}): string {
  const { data } = story
  const all = threadsFrom(rows)
  const here = all.filter((t) => inDraft(t.target, data.draft))
  const chapter = options.chapter ? findChapter(story, options.chapter) : undefined
  if (options.chapter && !chapter) throw new NotFound(`No chapter “${options.chapter}”. The chapters are: ${chapterList(story)}.`)
  const wanted = here.filter((t) => (options.resolved || !t.resolved) && (!chapter || ((t.target.kind === 'chapter' || t.target.kind === 'text') && t.target.id === chapter.id)))
  const open = here.filter((t) => !t.resolved).length
  const draft = data.drafts.length > 1 ? data.drafts.find((d) => d.id === data.draft) : undefined
  const out = [
    `# Comments on ${data.title.trim() || 'Untitled story'}${draft ? `, “${draft.name}”` : ''}${chapter ? `: ${story.chapterName(chapter)}` : ''}`,
    `${count(open, 'open comment')}, ${count(here.length - open, 'resolved')}${chapter ? ' in the whole story' : ''}. Reply with reply_to_comment and resolve with resolve_comment, giving a comment’s id.`,
  ]
  const elsewhere = all.filter((t) => !inDraft(t.target, data.draft) && !t.resolved)
  if (elsewhere.length) {
    const names = [...new Set(elsewhere.map((t) => draftOf(t.target)))].map((id) => data.drafts.find((d) => d.id === id)?.name ?? 'a deleted draft')
    out.push(`(${count(elsewhere.length, 'open comment')} on other drafts: ${names.map((n) => `“${n}”`).join(', ')}. Read those with the draft argument.)`)
  }
  if (!wanted.length) {
    out.push(options.resolved ? 'There are no comments here yet.' : 'There are no open comments here.')
    return out.join('\n\n')
  }
  const order = (t: CommentThread) => {
    const kinds = ['story', 'chapter', 'beat', 'arc', 'character', 'element', 'map']
    const k = t.target.kind === 'text' ? 'chapter' : t.target.kind
    const chapterAt = k === 'chapter' ? story.numberOf((t.target as { id: string }).id) || 999 : 0
    return kinds.indexOf(k) * 1000 + chapterAt
  }
  const groups = new Map<string, CommentThread[]>()
  for (const t of [...wanted].sort((a, b) => order(a) - order(b))) {
    const g = groupOf(story, t.target)
    groups.set(g, [...(groups.get(g) ?? []), t])
  }
  for (const [g, threads] of groups) out.push(`## ${g}\n${threads.map((t) => threadText(story, t)).join('\n')}`)
  return out.join('\n\n')
}

/** What an assistant can name to comment on. */
export interface CommentOn {
  chapter?: string
  quote?: string
  beat?: string
  arc?: string
  character?: string
  placeOrThing?: string
  mindMap?: string
  card?: string
}

/**
 * The target an assistant names (at most one thing; nothing for the whole
 * story), as it's kept with the comment: a passage by its words as the
 * chapter has them. A note on what it found (a quote found more than once).
 */
export function commentTarget(story: Story, on: CommentOn): { target: CommentTarget; note: string } {
  const { data } = story
  const named = [on.chapter && 'chapter', on.beat && 'beat', on.arc && 'arc', on.character && 'character', on.placeOrThing && 'place_or_thing', on.mindMap && 'mind_map']
    .filter(Boolean)
  if (named.length > 1) throw new NotFound(`Comment on one thing at a time: ${named.join(' and ')} were both given.`)
  if (on.quote && !on.chapter) throw new NotFound('A quote needs the chapter it’s from: give chapter too.')
  if (on.card && !on.mindMap) throw new NotFound('A card needs the mind map it’s on: give mind_map too.')
  const draft = data.draft
  let target: CommentTarget
  let note = ''
  if (on.chapter) {
    const chapter = findChapter(story, on.chapter)
    if (!chapter) throw new NotFound(`No chapter “${on.chapter}”. The chapters are: ${chapterList(story)}.`)
    if (on.quote?.trim()) {
      const text = data.texts[chapter.id]
      const found = text ? quoteIn(docText(text.doc, nameFor(story)), on.quote) : null
      if (!found)
        throw new NotFound(
          `Those words aren’t in ${story.chapterName(chapter)}. Quote them exactly as read_chapter shows them (a sentence or part of one, within one paragraph), or leave quote out to comment on the chapter as a whole.`,
        )
      if (found.times > 1) note = ` (Those words are in the chapter ${found.times} times; the comment is on the first. Quote more of the sentence to pick another.)`
      target = { kind: 'text', id: chapter.id, draft, ...found.anchor }
    } else target = { kind: 'chapter', id: chapter.id, draft }
  } else if (on.beat) {
    const beat = findByName(Object.values(data.beats), on.beat, (b) => story.beatName(b), (b) => b.id)
    if (!beat) throw new NotFound(`No beat “${on.beat}”. get_outline lists them.`)
    target = { kind: 'beat', id: beat.id, draft }
  } else if (on.arc) {
    const arc = findByName(data.arcs, on.arc, (a) => story.arcName(a), (a) => a.id)
    if (!arc) throw new NotFound(`No arc “${on.arc}”. The arcs are: ${data.arcs.map((a) => `“${story.arcName(a)}”`).join(', ') || 'none yet'}.`)
    target = { kind: 'arc', id: arc.id, draft }
  } else if (on.character) {
    const c = findByName(data.characters, on.character, (x) => displayName(x), (x) => x.id)
    if (!c) throw new NotFound(`No character “${on.character}”. The characters are: ${data.characters.map((x) => displayName(x)).join(', ') || 'none yet'}.`)
    target = { kind: 'character', id: c.id }
  } else if (on.placeOrThing) {
    const e = findByName(data.elements, on.placeOrThing, (x) => displayName(x), (x) => x.id)
    if (!e) throw new NotFound(`No place, object or group “${on.placeOrThing}”. They are: ${data.elements.map((x) => displayName(x)).join(', ') || 'none yet'}.`)
    target = { kind: 'element', id: e.id }
  } else if (on.mindMap) {
    const map = findByName(data.mindMaps, on.mindMap, (m) => m.name, (m) => m.id)
    if (!map) throw new NotFound(`No mind map “${on.mindMap}”. The maps are: ${data.mindMaps.map((m) => `“${m.name}”`).join(', ') || 'none yet'}.`)
    if (on.card?.trim()) {
      const node = findByName(map.nodes, on.card, (n) => cardName(n, data, story.lookup).replace(/^(Sticky note|Text|Group|Card:) /, '').replace(/[“”]/g, ''), (n) => n.id)
      if (!node) throw new NotFound(`No card “${on.card}” on “${map.name}”. get_mind_maps lists its cards: name one by its text or what it shows.`)
      target = { kind: 'map', id: map.id, node: node.id }
    } else target = { kind: 'map', id: map.id }
  } else target = { kind: 'story' }
  return { target: { ...target, label: labelFor(target, data, story.lookup) }, note }
}
