import { useEffect, type RefObject } from 'react'
import { useReactFlow, useStoreApi } from '@xyflow/react'
import type { MapNode, StoryData } from '../types'
import { useStory } from '../store/storyStore'
import { mentionables, parentOf, type CopiedMapItems } from '../store/storyOps'
import { displayName, lookupOf, plainText } from '../lib/mentions'
import { makeId } from '../lib/id'
import { picturesIn } from '../lib/pictures'
import type { StoryFlowEdge } from './StoryEdge'
import type { StoryFlowNode } from './mapShared'

// Copying and pasting cards on the mind map, with the keyboard only:
// Ctrl+C / Ctrl+X / Ctrl+V (⌘ on a Mac). The cards and the lines between
// them go on the clipboard in a type of their own, with their words as plain
// text alongside for pasting anywhere else.

const MIME = 'application/x-story-builder-cards'
/** How far a paste lands from the cards copied, down and to the right. */
const STEP = 32

// The last cards copied, from any map. Browsers that don't keep our own
// clipboard type still paste the plain text, and the same text means these.
let lastCopy: { items: CopiedMapItems; text: string } | null = null

/** The words on copied cards. */
function textOf(data: StoryData, nodes: MapNode[]): string {
  const lookup = lookupOf(mentionables(data))
  const words = nodes.map((n) => {
    switch (n.kind) {
      case 'note':
      case 'text':
        return plainText(n.text, lookup)
      case 'container':
        return plainText(n.title, lookup)
      case 'character': {
        const c = data.characters.find((x) => x.id === n.refId)
        return c ? displayName(c) : ''
      }
      case 'element': {
        const e = data.elements.find((x) => x.id === n.refId)
        return e ? displayName(e) : ''
      }
      case 'arc':
        return plainText(data.arcs.find((a) => a.id === n.refId)?.name ?? '', lookup)
      case 'chapter':
        return plainText(data.chapters.find((c) => c.id === n.refId)?.title ?? '', lookup)
      case 'beat':
        return plainText(data.beats[n.refId]?.title ?? '', lookup)
      default:
        return ''
    }
  })
  const text = words.map((w) => w.trim()).filter(Boolean).join('\n\n')
  return text || `${nodes.length} card${nodes.length === 1 ? '' : 's'} from a mind map`
}

const isTyping = (target: EventTarget | null) =>
  !!(target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]')

/** The letter of a shortcut, also on keyboards that don't type Latin letters. */
const letterOf = (e: KeyboardEvent) => (/^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : e.code.replace(/^Key/, '').toLowerCase())

interface Options {
  mapId: string
  wrapper: RefObject<HTMLDivElement | null>
  /** Pictures pasted from elsewhere go on the map too. */
  addPictures: (files: File[]) => void
  /** Called with the pasted cards' ids just before they're added, to select them (null: nothing came). */
  select: (ids: Set<string> | null) => void
}

export function useMapClipboard({ mapId, wrapper, addPictures, select }: Options) {
  const flowStore = useStoreApi<StoryFlowNode, StoryFlowEdge>()
  const { deleteElements, screenToFlowPosition } = useReactFlow()
  const pasteMapItems = useStory((s) => s.pasteMapItems)

  useEffect(() => {
    let copying: 'copy' | 'cut' | null = null
    let pasting = false

    const copySelected = () => {
      const flow = flowStore.getState()
      const ids = new Set(flow.nodes.filter((n) => n.selected).map((n) => n.id))
      const data = useStory.getState()
      const map = data.mindMaps.find((m) => m.id === mapId)
      if (!map) return null
      // A container comes with the cards on it.
      for (const n of map.nodes) if (ids.has(parentOf(n) ?? '')) ids.add(n.id)
      const nodes = map.nodes
        .filter((n) => ids.has(n.id))
        .map((n) => {
          // Where it's shown (cards stacked on a container are laid out there).
          const shown = flow.nodeLookup.get(n.id)?.position
          const copy = (shown ? { ...n, x: Math.round(shown.x), y: Math.round(shown.y) } : { ...n }) as MapNode & { parentId?: string }
          if (copy.parentId && !ids.has(copy.parentId)) delete copy.parentId
          return copy as MapNode
        })
      if (!nodes.length) return null
      const edges = map.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
      return { items: { nodes, edges }, text: textOf(data, nodes) }
    }

    /** Done copying; cutting then takes the cards off the map. */
    const finish = () => {
      if (copying === 'cut' && lastCopy) void deleteElements({ nodes: lastCopy.items.nodes.map((n) => ({ id: n.id })) })
      copying = null
    }

    /**
     * Pastes cards where they were copied from, if that's in view (a step down
     * and right for each copy already there), or else in the middle of the view.
     */
    const paste = (items: { nodes?: unknown; edges?: unknown }) => {
      const copied = (Array.isArray(items.nodes) ? items.nodes : []).filter(
        (n): n is Record<string, unknown> => typeof n === 'object' && n !== null,
      )
      const xs = copied.map((n) => Number(n.x)).filter(Number.isFinite)
      const ys = copied.map((n) => Number(n.y)).filter(Number.isFinite)
      if (!xs.length || !ys.length) return
      const box = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs) + 240, bottom: Math.max(...ys) + 120 }
      let offset = { x: 0, y: 0 }
      const r = wrapper.current?.getBoundingClientRect()
      if (r) {
        const a = screenToFlowPosition({ x: r.left, y: r.top })
        const b = screenToFlowPosition({ x: r.right, y: r.bottom })
        if (box.left < b.x && box.right > a.x && box.top < b.y && box.bottom > a.y) {
          const nodes = useStory.getState().mindMaps.find((m) => m.id === mapId)?.nodes ?? []
          const taken = (k: number) =>
            nodes.some((n) => Math.abs(n.x - (xs[0] + STEP * k)) < 4 && Math.abs(n.y - (ys[0] + STEP * k)) < 4)
          let k = 0
          while (k < 50 && taken(k)) k++
          offset = { x: STEP * k, y: STEP * k }
        } else {
          offset = { x: (a.x + b.x - box.left - box.right) / 2, y: (a.y + b.y - box.top - box.bottom) / 2 }
        }
      }
      const fresh = new Map(copied.map((n) => [String(n.id), makeId('node')]))
      select(new Set(fresh.values()))
      const ids = pasteMapItems(mapId, items, offset, (id) => fresh.get(id) ?? makeId('node'))
      if (!ids.length) select(null)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || isTyping(e.target)) return
      const letter = letterOf(e)
      if (letter === 'c' || letter === 'x') {
        // Words selected (on a chapter's page, say) copy as words.
        if (window.getSelection()?.toString()) return
        const copied = copySelected()
        if (!copied) return
        lastCopy = copied
        copying = letter === 'x' ? 'cut' : 'copy'
        // The copy event that follows puts them on the clipboard. A browser
        // that sends none (nothing selected) gets the words only.
        setTimeout(() => {
          if (!copying) return
          void navigator.clipboard?.writeText(copied.text).catch(() => {})
          finish()
        })
      } else if (letter === 'v') {
        pasting = true
        // Likewise, a browser that sends no paste event pastes the last cards copied here.
        setTimeout(() => {
          if (!pasting) return
          pasting = false
          if (lastCopy) paste(lastCopy.items)
        })
      }
    }

    const onCopy = (e: ClipboardEvent) => {
      if (!copying || !lastCopy || !e.clipboardData) return
      e.preventDefault()
      e.clipboardData.setData('text/plain', lastCopy.text)
      e.clipboardData.setData(MIME, JSON.stringify(lastCopy.items))
      finish()
    }

    const onPaste = (e: ClipboardEvent) => {
      pasting = false
      if (isTyping(e.target) || !e.clipboardData) return
      const raw = e.clipboardData.getData(MIME)
      if (raw) {
        e.preventDefault()
        try {
          paste(JSON.parse(raw) ?? {})
        } catch {
          // Not cards after all.
        }
        return
      }
      const files = picturesIn(e.clipboardData)
      if (files.length) {
        e.preventDefault()
        addPictures(files)
        return
      }
      const text = e.clipboardData.getData('text/plain').replace(/\r\n/g, '\n')
      if (lastCopy && text && text === lastCopy.text) {
        e.preventDefault()
        paste(lastCopy.items)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCopy)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCopy)
      window.removeEventListener('paste', onPaste)
    }
  }, [mapId, wrapper, addPictures, select, flowStore, deleteElements, screenToFlowPosition, pasteMapItems])
}
