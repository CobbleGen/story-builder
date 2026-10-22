import type { ArchiveKind, ArchivedItem } from '../types'
import { useMentionLookup, useStory } from '../store/storyStore'
import { notify } from '../store/history'
import { archivedName } from './archived'

const quoted = (name: string) => `“${name}”`

/** Archives a thing, saying so (and where it can be found again). */
export function useArchive() {
  const archiveThing = useStory((s) => s.archiveThing)
  return (kind: ArchiveKind, id: string, name: string) => {
    archiveThing(kind, id)
    notify(`Archived ${name}. It’s in the sidebar, under Archived.`)
  }
}

/** Brings an archived thing back (and what it needs: a beat's archived arc). */
export function useRestore() {
  const restoreArchived = useStory((s) => s.restoreArchived)
  const archive = useStory((s) => s.archive)
  const lookup = useMentionLookup()
  return (item: ArchivedItem) => {
    const arc = item.kind === 'beat' ? archive.find((a) => a.kind === 'arc' && a.arcs.some((r) => r.id === item.beats[0]?.arcId)) : undefined
    restoreArchived(item.id)
    notify(`Brought back ${quoted(archivedName(item, lookup))}${arc ? `, and its arc ${quoted(archivedName(arc, lookup))}` : ''}.`)
  }
}
