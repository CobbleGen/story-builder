import { ChevronDown, Eye } from 'lucide-react'
import type { Chapter } from '../types'
import { useStory } from '../store/storyStore'
import { displayName } from '../lib/mentions'
import { CharacterAvatar } from './CharacterAvatar'

/** Pill in a chapter header for choosing whose point of view the chapter is told from. */
export function PovPicker({ chapter }: { chapter: Chapter }) {
  const characters = useStory((s) => s.characters)
  const updateChapter = useStory((s) => s.updateChapter)
  const pov = characters.find((c) => c.id === chapter.povCharacterId)

  return (
    <label
      className={`pov-pill${pov ? '' : ' empty'}`}
      style={pov ? ({ '--char': pov.color } as React.CSSProperties) : undefined}
      title={pov ? `Told from ${displayName(pov)}’s point of view` : 'Choose whose point of view this chapter is told from'}
    >
      {pov ? <CharacterAvatar character={pov} size="xs" /> : <Eye size={13} />}
      <span className="pov-name">{pov ? displayName(pov) : 'POV'}</span>
      <ChevronDown size={12} />
      <select
        value={chapter.povCharacterId ?? ''}
        onChange={(e) => updateChapter(chapter.id, { povCharacterId: e.target.value || null })}
        aria-label="Point of view character"
      >
        <option value="">No POV character</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {displayName(c)}
          </option>
        ))}
      </select>
    </label>
  )
}
