import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, ChevronDown, Network, PenLine, Plus, Trash2 } from 'lucide-react'
import type { MindMap } from '../types'
import { useStory } from '../store/storyStore'
import { askConfirm } from '../lib/confirm'

/** The map's name, with a menu to switch maps, start a new one, rename or delete this one. */
export function MapSwitcher({ map }: { map: MindMap }) {
  const maps = useStory((s) => s.mindMaps)
  const addMindMap = useStory((s) => s.addMindMap)
  const renameMindMap = useStory((s) => s.renameMindMap)
  const deleteMindMap = useStory((s) => s.deleteMindMap)
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  // A new map opens with its name ready to type (the canvas starts afresh for each map).
  const [renaming, setRenaming] = useState(() => (location.state as { rename?: boolean } | null)?.rename === true)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const create = () => {
    setOpen(false)
    const id = addMindMap('Untitled map')
    navigate(`/map/${id}`, { state: { rename: true } })
  }

  const remove = async () => {
    setOpen(false)
    const cards = map.nodes.length
    const ok = await askConfirm({
      title: `Delete the map “${map.name}”?`,
      message: cards
        ? `Its ${cards} card${cards === 1 ? '' : 's'} and lines go with it. Chapters, arcs, characters and beats on it stay in your story.`
        : undefined,
      confirmLabel: 'Delete map',
      danger: true,
    })
    if (!ok) return
    const next = maps.find((m) => m.id !== map.id)
    deleteMindMap(map.id)
    navigate(next ? `/map/${next.id}` : '/map', { replace: true })
  }

  return (
    <div className="map-switcher" ref={box}>
      {renaming ? (
        <input
          className="map-switcher-name"
          autoFocus
          defaultValue={map.name}
          aria-label="Map name"
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            renameMindMap(map.id, e.target.value.trim() || 'Untitled map')
            setRenaming(false)
            if ((location.state as { rename?: boolean } | null)?.rename) navigate(location.pathname, { replace: true, state: null })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              e.currentTarget.value = map.name
              e.currentTarget.blur()
            }
          }}
        />
      ) : (
        <button
          className="map-switcher-btn"
          onClick={() => setOpen((o) => !o)}
          onDoubleClick={() => setRenaming(true)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Switch maps, or double-click to rename"
        >
          <Network size={15} />
          <span className="map-switcher-label">{map.name}</span>
          {maps.length > 1 && <span className="map-switcher-count">{maps.length}</span>}
          <ChevronDown size={14} />
        </button>
      )}
      {open && (
        <div className="menu-list menu-left map-switcher-menu" role="menu">
          {maps.map((m) => (
            <button
              key={m.id}
              role="menuitemradio"
              aria-checked={m.id === map.id}
              className="menu-item"
              onClick={() => {
                setOpen(false)
                navigate(`/map/${m.id}`)
              }}
            >
              <Network size={16} />
              <span className="map-switcher-item">{m.name}</span>
              {m.id === map.id && <Check size={15} className="menu-check" />}
            </button>
          ))}
          <button role="menuitem" className="menu-item separated" onClick={create}>
            <Plus size={16} /> New map
          </button>
          <button
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false)
              setRenaming(true)
            }}
          >
            <PenLine size={16} /> Rename this map
          </button>
          <button role="menuitem" className="menu-item danger" onClick={remove}>
            <Trash2 size={16} /> Delete this map
          </button>
        </div>
      )}
    </div>
  )
}
