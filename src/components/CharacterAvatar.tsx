import type { Character } from '../types'
import { displayName } from '../lib/mentions'
import { useImageUrl } from '../store/images'

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('')
    .toUpperCase()
}

interface Props {
  character: Pick<Character, 'name' | 'color' | 'portrait'>
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** False to show initials even when there's a portrait. */
  portrait?: boolean
}

/** A character's round badge: their portrait, else their initials, in their colour. */
export function CharacterAvatar({ character, size = 'md', portrait = true }: Props) {
  const url = useImageUrl(portrait ? character.portrait : undefined)
  return (
    <span
      className={`avatar avatar-${size}${url ? ' has-portrait' : ''}`}
      style={{ '--char': character.color } as React.CSSProperties}
      aria-hidden
      title={displayName(character)}
    >
      {url ? <img src={url} alt="" draggable={false} /> : initials(character.name)}
    </span>
  )
}
