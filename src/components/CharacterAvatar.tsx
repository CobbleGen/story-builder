import type { Character } from '../types'
import { displayName } from '../lib/mentions'

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
  character: Pick<Character, 'name' | 'color'>
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

export function CharacterAvatar({ character, size = 'md' }: Props) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ '--char': character.color } as React.CSSProperties}
      aria-hidden
      title={displayName(character)}
    >
      {initials(character.name)}
    </span>
  )
}
