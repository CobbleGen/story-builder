import { useEffect, useState } from 'react'
import { askConfirm } from '../lib/confirm'
import { backupNow, listBackups, type Backup, type BackupReason } from '../store/backups'
import { useStory } from '../store/storyStore'
import { Modal } from './Modal'

const REASONS: Record<BackupReason, string> = {
  'new-version': 'Before an app update',
  periodic: 'Automatic',
  'before-replace': 'Before replacing the story',
}

const when = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

interface Summary {
  title: string
  counts: string
  state: unknown
}

function summarize(raw: string): Summary | null {
  try {
    const state = JSON.parse(raw)?.state
    if (!state || typeof state !== 'object') return null
    const n = (value: unknown) => (Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 0)
    const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
    return {
      title: typeof state.title === 'string' && state.title.trim() ? state.title : 'Untitled story',
      counts: [
        plural(n(state.chapters), 'chapter'),
        plural(n(state.beats), 'beat'),
        plural(n(state.characters), 'character'),
      ].join(' · '),
      state,
    }
  } catch {
    return null
  }
}

export function BackupsDialog({ onClose }: { onClose: () => void }) {
  const replaceStory = useStory((s) => s.replaceStory)
  const [backups, setBackups] = useState<Backup[] | null>(null)

  useEffect(() => {
    let live = true
    void listBackups().then((list) => live && setBackups(list))
    return () => {
      live = false
    }
  }, [])

  const restore = async (backup: Backup, summary: Summary) => {
    const ok = await askConfirm({
      title: 'Restore this backup?',
      message: `Your story will be replaced by the copy from ${when.format(backup.at)}. The current story is backed up first, so you can switch back.`,
      confirmLabel: 'Restore backup',
      danger: true,
    })
    if (!ok) return
    await backupNow('before-replace')
    replaceStory(summary.state)
    onClose()
  }

  return (
    <Modal title="Backups" onClose={onClose}>
      <h2 className="confirm-title">Backups</h2>
      <p className="confirm-message">
        Your story saves automatically as you work. Copies are also kept in this browser when the app updates, twice a
        day while you use it, and before the story is replaced. The last 30 are kept.
      </p>
      {backups === null ? null : backups.length === 0 ? (
        <p className="section-empty backup-empty">No backups yet. The first is made the next time Story Builder opens.</p>
      ) : (
        <ul className="backup-list">
          {backups.map((b) => {
            const summary = summarize(b.raw)
            return (
              <li key={b.id} className="backup-row">
                <div className="backup-info">
                  <span className="backup-when">{when.format(b.at)}</span>
                  <span className="backup-meta">
                    {summary ? `${summary.title} · ${summary.counts}` : 'Unreadable copy'}
                  </span>
                  <span className="backup-reason">{REASONS[b.reason] ?? 'Automatic'}</span>
                </div>
                {summary && (
                  <button className="btn ghost" onClick={() => restore(b, summary)}>
                    Restore
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
