import { useState } from 'react'
import { useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { nextArcColor } from '../lib/colors'
import { Modal } from '../components/Modal'
import { ArcPicker } from '../components/ArcPicker'
import { MentionTextarea } from '../components/MentionTextarea'

interface Props {
  title: string
  description: string
  onCancel: () => void
  onCreate: (beat: { arcId: string; title: string; description: string }) => void
}

/** Turns the selected text into a beat of the chosen arc. */
export function NewBeatDialog({ title: initialTitle, description: initialDescription, onCancel, onCreate }: Props) {
  const arcs = useStory((s) => s.arcs)
  const addArc = useStory((s) => s.addArc)
  const lastArcId = useUi((s) => s.lastArcId)
  const setLastArcId = useUi((s) => s.setLastArcId)
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [arcId, setArcId] = useState<string | null>(
    arcs.some((a) => a.id === lastArcId) ? lastArcId : (arcs[0]?.id ?? null),
  )
  const [newArc, setNewArc] = useState('')

  const create = (text = title) => {
    if (!text.trim()) return
    let chosen = arcId
    if (!chosen) {
      if (!newArc.trim()) return
      chosen = addArc({ name: newArc.trim(), color: nextArcColor(arcs.map((a) => a.color)) })
    }
    setLastArcId(chosen)
    onCreate({ arcId: chosen, title: text.trim(), description: description.trim() })
  }

  const canCreate = !!title.trim() && (!!arcId || !!newArc.trim())

  return (
    <Modal
      title="New beat"
      onClose={onCancel}
      accent={arcs.find((a) => a.id === arcId)?.color}
      footer={
        <>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" disabled={!canCreate} onClick={() => create()}>
            Create beat
          </button>
        </>
      }
    >
      <div className="editor">
        <span className="field-label">New beat from the selected text</span>
        <MentionTextarea
          autoFocus
          className="editor-title"
          value={title}
          onChange={setTitle}
          placeholder="What happens?"
          aria-label="Beat"
          submitOnEnter
          onSubmit={create}
        />
        <div className="field">
          <span className="field-label">Arc</span>
          {arcs.length > 0 ? (
            <ArcPicker arcs={arcs} value={arcId} onChange={setArcId} />
          ) : (
            <input
              className="plain-input"
              value={newArc}
              onChange={(e) => setNewArc(e.target.value)}
              placeholder="Name a new arc for it"
              aria-label="New arc name"
            />
          )}
        </div>
        <div className="field">
          <span className="field-label">Notes</span>
          <MentionTextarea
            className="editor-desc"
            value={description}
            onChange={setDescription}
            placeholder="Anything else about this beat (optional)"
            aria-label="Notes"
          />
        </div>
        <p className="dialog-note">The beat goes into this chapter, ticked off, with the selected text linked to it.</p>
      </div>
    </Modal>
  )
}
