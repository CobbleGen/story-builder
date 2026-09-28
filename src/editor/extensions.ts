import StarterKit from '@tiptap/starter-kit'
import Typography from '@tiptap/extension-typography'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { BeatLink } from './beatLinks'
import { CharacterMention } from './mention'

/** Everything the manuscript editor supports. */
export function manuscriptExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      code: false,
      codeBlock: false,
      link: false,
    }),
    // Curly quotes, em dashes (--), ellipses (...).
    Typography,
    Placeholder.configure({ placeholder }),
    CharacterCount,
    BeatLink,
    CharacterMention,
  ]
}
