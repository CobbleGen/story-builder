import { Flag, Gem, MapPin, Sparkles, type LucideIcon } from 'lucide-react'
import type { ElementKind, StoryElement } from '../types'
import { displayName, type Mentionable } from '../lib/mentions'
import { CharacterAvatar } from './CharacterAvatar'
import { useImageUrl } from '../store/images'

const ICONS: Record<ElementKind, LucideIcon> = {
  place: MapPin,
  object: Gem,
  group: Flag,
  other: Sparkles,
}

const ICON_SIZE = { xs: 10, sm: 12, md: 14, lg: 22 } as const

type Size = keyof typeof ICON_SIZE

/** The icon for a kind of element, on its own. */
export function KindIcon({ kind, size = 14 }: { kind: ElementKind; size?: number }) {
  const Icon = ICONS[kind]
  return <Icon size={size} aria-hidden />
}

interface Props {
  element: Pick<StoryElement, 'kind' | 'name' | 'color' | 'portrait'>
  size?: Size
  /** False to show the icon even when there's a picture. */
  portrait?: boolean
}

/**
 * A place, object or group's badge: its picture, else its kind's icon, in its
 * colour (the counterpart of a character's avatar).
 */
export function ElementIcon({ element, size = 'md', portrait = true }: Props) {
  const Icon = ICONS[element.kind]
  const url = useImageUrl(portrait ? element.portrait : undefined)
  return (
    <span
      className={`avatar element-icon avatar-${size}${url ? ' has-portrait' : ''}`}
      style={{ '--char': element.color } as React.CSSProperties}
      aria-hidden
      title={displayName(element)}
    >
      {url ? <img src={url} alt="" draggable={false} /> : <Icon size={ICON_SIZE[size]} strokeWidth={2.2} />}
    </span>
  )
}

/** A character's avatar, or an element's icon. */
export function MentionBadge({ item, size = 'md' }: { item: Mentionable; size?: Size }) {
  return item.kind ? (
    <ElementIcon element={{ kind: item.kind, name: item.name, color: item.color, portrait: item.portrait }} size={size} />
  ) : (
    <CharacterAvatar character={item} size={size} />
  )
}
