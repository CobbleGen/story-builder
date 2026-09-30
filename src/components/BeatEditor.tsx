import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Trash2 } from 'lucide-react'
import { useMentionLookup, useStory } from '../store/storyStore'
import { useUi } from '../store/uiStore'
import { askConfirm } from '../lib/confirm'
import { plainText } from '../lib/mentions'
import { Modal } from './Modal'
import { ArcPicker } from './ArcPicker'
import { MentionTextarea } from './MentionTextarea'

/** Dialog for editing the beat selected in the UI store. Changes save as you type. */
export function BeatEditor() {
  const beatId = useUi((s) => s.editingBeatId)
  const openBeat = useUi((s) => s.openBeat)
  const beat = useStory((s) => (beatId ? s.beats[beatId] : undefined))
  const arcs = useStory((s) => s.arcs)
  const chapters = useStory((s) => s.chapters)
  const updateBeat = useStory((s) => s.updateBeat)
  const setBeatArc = useStory((s) => s.setBeatArc)
  const placeBeat = useStory((s) => s.placeBeat)
  const deleteBeat = useStory((s) => s.deleteBeat)
  const lookup = useMentionLookup()
  const close = useCallback(() => openBeat(null), [openBeat])

  if (!beat) return null
  const arc = arcs.find((a) => a.id === beat.arcId)

  const remove = async () => {
    const ok = await askConfirm({
      title: 'Delete this beat?',
      message: `“${plainText(beat.title, lookup) || 'Untitled beat'}” will be removed from its arc${beat.chapterId ? ' and chapter' : ''}.`,
      confirmLabel: 'Delete beat',
      danger: true,
    })
    if (ok) {
      deleteBeat(beat.id)
      close()
    }
  }

  return (
    <Modal
      title="Edit beat"
      onClose={close}
      accent={arc?.color}
      footer={
        <>
          <button className="btn ghost danger" onClick={remove}>
            <Trash2 size={16} /> Delete
          </button>
          {arc && (
            <Link className="btn ghost" to={`/arcs/${arc.id}`} onClick={close}>
              Open arc <ArrowUpRight size={16} />
            </Link>
          )}
          <button className="btn primary" onClick={close}>
            Done
          </button>
        </>
      }
    >
      <div className="editor">
        <MentionTextarea
          autoFocus
          className="editor-title"
          value={beat.title}
          placeholder="Untitled beat"
          aria-label="Beat title"
          submitOnEnter
          onChange={(title) => updateBeat(beat.id, { title })}
        />
        <div className="field">
          <span className="field-label">Arc</span>
          <ArcPicker arcs={arcs} value={beat.arcId} onChange={(arcId) => setBeatArc(beat.id, arcId)} />
        </div>
        <label className="field">
          <span className="field-label">Chapter</span>
          <select
            className="select"
            value={beat.chapterId ?? ''}
            onChange={(e) => placeBeat(beat.id, e.target.value || null)}
          >
            <option value="">Not in a chapter</option>
            {chapters.map((c, i) => (
              <option key={c.id} value={c.id}>
                Chapter {i + 1}
                {c.title ? `: ${plainText(c.title, lookup)}` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label">Notes</span>
          <MentionTextarea
            className="editor-desc"
            value={beat.description}
            placeholder="What happens, who is there, why it matters… Type @ to mention a character."
            aria-label="Notes"
            onChange={(description) => updateBeat(beat.id, { description })}
          />
        </div>
      </div>
    </Modal>
  )
}
