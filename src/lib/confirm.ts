import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  /** Style the confirm button as destructive. */
  danger?: boolean
  /** Show a single acknowledge button instead of Cancel + confirm. */
  notice?: boolean
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

export const useConfirmStore = create<{ request: ConfirmRequest | null }>(() => ({ request: null }))

/** Asks the user in an in-page dialog; resolves true only if they confirm. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().request?.resolve(false)
    useConfirmStore.setState({ request: { ...options, resolve } })
  })
}

export function answerConfirm(ok: boolean) {
  const request = useConfirmStore.getState().request
  if (!request) return
  useConfirmStore.setState({ request: null })
  request.resolve(ok)
}
