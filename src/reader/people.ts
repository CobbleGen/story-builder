import type { Character, StoryElement } from '../types'
import { displayName } from '../lib/mentions'
import { mentionPlaces } from '../lib/mentionedIn'
import { NotFound, count, findByName, isCharacter, kindNoun, type Story } from './story'
import { clip, paragraphsMentioning } from './text'
import { relationsOf } from './maps'

// Characters, and places, objects and groups: everything the writer noted
// about each, and everywhere they turn up.

type Item = Character | StoryElement

/** The most manuscript passages shown for one character or element. */
const MAX_PASSAGES = 40

function profile(story: Story, item: Item, passages: boolean): string {
  const { data } = story
  const name = displayName(item)
  const lines = [`## ${name}${isCharacter(item) ? '' : ` (${kindNoun(item)})`}`]
  const description = story.plain(item.description)
  if (description) lines.push(description)
  for (const a of item.attributes) {
    const value = story.plain(a.value)
    if (a.label.trim() || value) lines.push(`- ${a.label.trim() || 'Note'}: ${value || '(blank)'}`)
  }
  if (item.portrait) lines.push(`Has a ${isCharacter(item) ? 'portrait' : 'picture'} (pictures aren’t available here).`)

  if (isCharacter(item)) {
    const pov = data.chapters.filter((c) => c.povCharacterId === item.id)
    if (pov.length) lines.push(`Point of view of: ${pov.map(story.chapterName).join('; ')}`)
    const arcs = data.arcs.filter((a) => a.characterIds.includes(item.id))
    if (arcs.length) lines.push(`In the arcs: ${arcs.map((a) => story.arcName(a)).join('; ')}`)
  }

  const places = mentionPlaces(data, item.id)
  if (places.texts.length) {
    lines.push(`Named in the manuscript: ${places.texts.map((t) => `chapter ${story.numberOf(t.chapter.id)} (${count(t.count, 'time')})`).join(', ')}`)
  }
  if (places.beats.length) {
    const where = (chapterId: string | null) => (chapterId ? `chapter ${story.numberOf(chapterId)}` : 'not in a chapter')
    lines.push(`Named in beats: ${places.beats.map((b) => `“${story.beatName(b)}” (${where(b.chapterId)})`).join('; ')}`)
  }
  if (places.chapters.length) lines.push(`Named in chapter titles or summaries: ${places.chapters.map(story.chapterName).join('; ')}`)
  if (places.arcs.length) lines.push(`Named in arcs: ${places.arcs.map((a) => story.arcName(a)).join('; ')}`)
  const others = [...places.characters, ...places.elements]
  if (others.length) lines.push(`Named in the details of: ${others.map((o) => displayName(o)).join(', ')}`)
  const relations = relationsOf(story, item.id)
  if (relations.length) lines.push(`On the mind maps:\n${relations.map((r) => `- ${r}`).join('\n')}`)

  if (passages) {
    const found: string[] = []
    for (const { chapter } of places.texts) {
      const doc = data.texts[chapter.id]?.doc
      if (!doc) continue
      for (const p of paragraphsMentioning(doc, item.id, story)) found.push(`- Chapter ${story.numberOf(chapter.id)}: “${clip(p, 600)}”`)
    }
    if (found.length) {
      const more = found.length > MAX_PASSAGES ? `\n(and ${count(found.length - MAX_PASSAGES, 'more passage')}; search_story finds the rest)` : ''
      lines.push(`### Passages in the manuscript that name ${name}\n${found.slice(0, MAX_PASSAGES).join('\n')}${more}`)
    }
    if (places.beats.length) {
      const beats = places.beats.map((b) => {
        const text = story.plain(b.description)
        return `- “${story.beatName(b)}”${text ? `: ${text}` : ''}`
      })
      lines.push(`### Beats that name ${name}\n${beats.join('\n')}`)
    }
  }
  return lines.join('\n')
}

const NOTE =
  'Names in the text are links the writer made (an @mention), so plain-text uses of a name aren’t counted here; search_story finds those too.'

function listOf(story: Story, items: Item[], heading: string, empty: string, name: string | undefined, kindWord: string): string {
  const title = story.data.title.trim() || 'Untitled story'
  if (name?.trim()) {
    const item = findByName(items, name, displayName, (i) => i.id)
    if (!item) throw new NotFound(`No ${kindWord} “${name}”. There are: ${items.map((i) => displayName(i)).join(', ') || 'none yet'}.`)
    return [`# ${displayName(item)}, in ${title}`, NOTE, profile(story, item, true)].join('\n\n')
  }
  if (!items.length) return `# ${heading} in ${title}\n\n${empty}`
  return [`# ${heading} in ${title} (${items.length})`, NOTE, ...items.map((i) => profile(story, i, false))].join('\n\n')
}

/** Every character's profile, or one character in depth (with the passages naming them). */
export const characters = (story: Story, name?: string) =>
  listOf(story, story.data.characters, 'Characters', 'No characters yet.', name, 'character')

/** Every place, object and group, or one in depth. */
export const placesAndThings = (story: Story, name?: string) =>
  listOf(story, story.data.elements, 'Places, objects and groups', 'No places, objects or groups yet.', name, 'place, object or group')
