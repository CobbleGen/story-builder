import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { MentionTextarea } from './MentionTextarea'
import { ArcPicker } from './ArcPicker'

/** "Add a beat" button that opens a small form for a new beat in a chapter. */
export function BeatComposer({ chapterId, label = 'Add a beat' }: { chapterId: string; label?: string }) {
  const arcs = useStory((s) => s.arcs)
  const addBeat = useStory((s) => s.addBeat)
  const lastArcId = useUi((s) => s.lastArcId)
  const setLastArcId = useUi((s) => s.setLastArcId)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const arcId = arcs.some((a) => a.id === lastArcId) ? lastArcId : (arcs[0]?.id ?? null)

  if (!open) {
    return (
      <button className="add-beat" onClick={() => setOpen(true)}>
        <Plus size={16} /> {label}
      </button>
    )
  }

  if (!arcId) {
    return (
      <div className="composer">
        <p className="composer-note">Beats belong to an arc. Create an arc first.</p>
        <div className="form-actions">
          {!sidebarOpen && (
            <button className="btn primary" onClick={toggleSidebar}>
              Show arcs
            </button>
          )}
          <button className="btn ghost" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    )
  }

  const submit = (text = title) => {
    if (!text.trim()) return
    addBeat({ arcId, title: text.trim(), chapterId })
    setTitle('')
  }
  const close = () => {
    setOpen(false)
    setTitle('')
  }

  return (
    <form
      className="composer"
      style={{ '--arc': arcs.find((a) => a.id === arcId)?.color } as React.CSSProperties}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <MentionTextarea
        autoFocus
        className="composer-input"
        value={title}
        placeholder="What happens? Type @ to mention a character"
        aria-label="New beat"
        submitOnEnter
        onSubmit={submit}
        onChange={setTitle}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            close()
          }
        }}
      />
      <ArcPicker arcs={arcs} value={arcId} onChange={setLastArcId} compact />
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={!title.trim()}>
          Add beat
        </button>
        <button type="button" className="icon-btn" onClick={close} aria-label="Cancel">
          <X size={18} />
        </button>
      </div>
    </form>
  )
}
