import { useCallback } from 'react'
import { answerConfirm, useConfirmStore } from '../lib/confirm'
import { Modal } from './Modal'

export function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request)
  const cancel = useCallback(() => answerConfirm(false), [])
  if (!request) return null

  return (
    <Modal
      title={request.title}
      onClose={cancel}
      variant="confirm"
      footer={
        <>
          {!request.notice && (
            <button className="btn ghost" onClick={cancel}>
              Cancel
            </button>
          )}
          <button
            autoFocus
            className={`btn primary${request.danger ? ' destructive' : ''}`}
            onClick={() => answerConfirm(true)}
          >
            {request.confirmLabel ?? (request.notice ? 'OK' : 'Confirm')}
          </button>
        </>
      }
    >
      <h2 className="confirm-title">{request.title}</h2>
      {request.message && <p className="confirm-message">{request.message}</p>}
    </Modal>
  )
}
