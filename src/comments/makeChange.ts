import type { RichNode, StoryData } from '../types'
import * as ops from '../store/storyOps'
import type { Lookup } from '../lib/mentions'
import { docText, findAnchor, type TextAnchor } from './anchor'
import type { CommentTarget, Suggestion } from './model'
import { canSuggest, fieldValue, relink, withField, type NameOf } from './suggestions'

// Making a suggested change, as the writer accepts it: the text worked out
// with the editor's schema (loaded only then), or the field set.

/**
 * A chapter's text with a suggested passage changed (found by its words, as
 * they were), and its words counted; null when the words aren't there as
 * they were. The editor's schema loads only when needed.
 */
export async function textWithChange(doc: RichNode, anchor: TextAnchor, words: string, nameOf: NameOf): Promise<{ doc: RichNode; words: number } | null> {
  const found = findAnchor(docText(doc, nameOf), anchor)
  if (!found?.exact) return null
  const [{ getSchema }, { manuscriptExtensions }, { Node }, { Transform }, { countWords }] = await Promise.all([
    import('@tiptap/core'),
    import('../editor/extensions'),
    import('@tiptap/pm/model'),
    import('@tiptap/pm/transform'),
    import('../editor/wordChanges'),
  ])
  const schema = getSchema(manuscriptExtensions(''))
  const before = Node.fromJSON(schema, doc)
  const marks = before.resolve(found.from).marks()
  const clean = words.replace(/\s*\n\s*/g, ' ')
  const tr = new Transform(before)
  if (clean) tr.replaceWith(found.from, found.to, schema.text(clean, marks))
  else {
    // Words cut: the space before them goes too, when what follows is a space, punctuation or the paragraph's end.
    const $to = before.resolve(found.to)
    const after = $to.parent.textBetween($to.parentOffset, Math.min($to.parent.content.size, $to.parentOffset + 1))
    const spaced = found.from > 1 && before.textBetween(found.from - 1, found.from) === ' '
    tr.delete(spaced && (!after || /[\s.,;:!?)”’]/.test(after)) ? found.from - 1 : found.from, found.to)
  }
  return { doc: tr.doc.toJSON() as RichNode, words: countWords(tr.doc) }
}

/**
 * The change a suggestion makes, to make on the story as it is then (the text
 * is worked out first, which takes a moment); null when it can't be made (as
 * its view says).
 */
export async function suggestedChange(data: StoryData, target: CommentTarget, lookup: Lookup, nameOf: NameOf): Promise<((data: StoryData) => StoryData) | null> {
  const s: Suggestion | undefined = target.suggest
  if (!s) return null
  if ('text' in s) {
    const id = (target as { id: string }).id
    const text = data.texts[id]
    const changed = text ? await textWithChange(text.doc, target as TextAnchor, s.text, nameOf) : null
    if (!changed) return null
    // (Not counted as the writer's writing: someone else's words, accepted.)
    return (d) => ops.setChapterText(d, id, { doc: changed.doc, words: changed.words, updatedAt: Date.now() }, null)
  }
  if (fieldValue(target, s.field, data) === undefined || !canSuggest(target, s.field, data)) return null
  const value = relink(s.from, s.to, lookup)
  return (d) => withField(d, target, s.field, value)
}
