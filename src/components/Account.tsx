import { useEffect, useState, type FormEvent } from 'react'
import { BookPlus, CircleAlert, CloudOff, LogOut, RefreshCw, Trash2, UserRound } from 'lucide-react'
import { cloud, useCloud, type CloudState } from '../cloud'
import { askConfirm } from '../lib/confirm'
import { buildBlankStory } from '../store/sampleStory'
import { when } from '../lib/when'
import { Modal } from './Modal'
import { AssistantLinks } from './AssistantLinks'

// The writer's account: signing in (or up), and once signed in, the stories
// in it and how this browser's story stands with it.

type Tone = 'good' | 'busy' | 'quiet' | 'bad'

/** How the story stands with the account, in words, and a colour for the dot. */
function standing(s: CloudState): { text: string; tone: Tone } {
  switch (s.status) {
    case 'connecting':
      return { text: 'Connecting to your account…', tone: 'busy' }
    case 'saving':
      return { text: 'Saving to your account…', tone: 'busy' }
    case 'offline':
      return { text: 'Offline: your changes are kept here and saved to your account when you’re back online.', tone: 'quiet' }
    case 'conflict':
      return { text: 'This story was changed in another browser too.', tone: 'bad' }
    case 'unlinked':
      return { text: 'Choose a story to open here.', tone: 'busy' }
    case 'error':
      return { text: s.error ?? 'Something went wrong with your account.', tone: 'bad' }
    case 'synced':
      if (s.pending) return { text: 'Saving to your account in a moment…', tone: 'busy' }
      return { text: s.savedAt ? `Saved to your account ${when(s.savedAt)}` : 'Saved to your account', tone: 'good' }
    default:
      return { text: '', tone: 'quiet' }
  }
}

/** The account button in the top bar: "Sign in", or the writer's initial with how the story stands. */
export function AccountButton() {
  const state = useCloud((s) => s)
  const [open, setOpen] = useState(false)
  // It opens by itself when the account needs an answer (once each time).
  const asking = state.status === 'unlinked' || state.status === 'conflict' || state.recovering || (!state.user && !!(state.error || state.notice))
  const [asked, setAsked] = useState(false)
  if (asking !== asked) {
    setAsked(asking)
    if (asking) setOpen(true)
  }
  if (state.status === 'off') return null
  const { text, tone } = standing(state)
  const show = () => {
    void cloud?.prepare().catch(() => {})
    setOpen(true)
  }
  return (
    <>
      {state.user ? (
        <button className="account-btn signed-in" onClick={show} aria-label={`Your account: ${state.user.email}. ${text}`} title={`${state.user.email}\n${text}`}>
          <span className="account-initial" aria-hidden>
            {(state.user.email[0] ?? '?').toUpperCase()}
          </span>
          <span className={`sync-dot ${tone}`} aria-hidden />
        </button>
      ) : (
        <button className="account-btn" onClick={show} title="Sign in to keep your story in your account">
          <UserRound size={16} />
          <span className="account-label">Sign in</span>
        </button>
      )}
      {open && <AccountDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function AccountDialog({ onClose }: { onClose: () => void }) {
  const user = useCloud((s) => s.user)
  const recovering = useCloud((s) => s.recovering)
  return (
    <Modal title="Your account" onClose={onClose}>
      {recovering ? <NewPassword onDone={onClose} /> : user ? <AccountView onClose={onClose} /> : <SignIn />}
    </Modal>
  )
}

/** From the ⋯ menu: links for AI assistants to read the stories, once signed in (the stories are read from the account). */
export function AssistantDialog({ onClose }: { onClose: () => void }) {
  const user = useCloud((s) => s.user)
  const off = useCloud((s) => s.status === 'off')
  return (
    <Modal title="AI assistants" onClose={onClose}>
      {user ? (
        <div className="account-view">
          <AssistantLinks />
        </div>
      ) : (
        <>
          <h2 className="confirm-title">Let an AI assistant read your stories</h2>
          <p className="confirm-message">
            An assistant such as Claude can read everything in your stories (the manuscript, outline, timeline, characters, places and mind maps) to
            give you feedback, but never change them. It reads them from your account, so {off ? 'this needs a version of Story Builder with accounts.' : 'sign in first.'}
          </p>
          {!off && <SignIn />}
        </>
      )}
    </Modal>
  )
}

type Mode = 'sign-in' | 'sign-up' | 'reset'

function SignIn() {
  const linkError = useCloud((s) => s.error)
  const linkNotice = useCloud((s) => s.notice)
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const switchTo = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!cloud || busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'sign-in') await cloud.signIn(email, password)
      else if (mode === 'sign-up') {
        if (password.length < 8) throw new Error('Choose a longer password: at least 8 characters.')
        const signedIn = await cloud.signUp(email, password)
        if (!signedIn) {
          setMode('sign-in')
          setPassword('')
          setNotice(`Almost there: we’ve sent a link to ${email.trim()}. Follow it to confirm your address, then sign in here.`)
        }
      } else {
        await cloud.sendPasswordReset(email)
        setNotice(`If there’s an account for ${email.trim()}, an email with a link to choose a new password is on its way.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const heading = mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create an account' : 'Forgot your password?'
  const action = mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send me a link'
  return (
    <form className="account-form" onSubmit={submit}>
      <h2 className="confirm-title">{heading}</h2>
      <p className="confirm-message">
        {mode === 'reset'
          ? 'We’ll email you a link to choose a new password.'
          : 'Keep your story in your account: saved as you work, and there in any browser you sign in on. Without an account it stays in this browser only.'}
      </p>
      {linkError && !notice && !error && <p className="account-error">{linkError}</p>}
      {linkNotice && !notice && !error && <p className="account-notice">{linkNotice}</p>}
      {notice && <p className="account-notice">{notice}</p>}
      <label className="field">
        <span className="field-label">Email</span>
        <input className="plain-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </label>
      {mode !== 'reset' && (
        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="plain-input"
            type="password"
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            required
            minLength={mode === 'sign-up' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'sign-up' && <span className="field-hint">At least 8 characters.</span>}
        </label>
      )}
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="form-actions account-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'One moment…' : action}
        </button>
        {mode === 'sign-in' && (
          <button type="button" className="link-btn" onClick={() => switchTo('reset')}>
            Forgot your password?
          </button>
        )}
      </div>
      <p className="account-switch">
        {mode === 'sign-up' ? (
          <>
            Already have an account?{' '}
            <button type="button" className="link-btn" onClick={() => switchTo('sign-in')}>
              Sign in
            </button>
          </>
        ) : mode === 'reset' ? (
          <button type="button" className="link-btn" onClick={() => switchTo('sign-in')}>
            Back to signing in
          </button>
        ) : (
          <>
            New here?{' '}
            <button type="button" className="link-btn" onClick={() => switchTo('sign-up')}>
              Create an account
            </button>
          </>
        )}
      </p>
    </form>
  )
}

/** Back from a password reset email: the new password. */
function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!cloud || busy) return
    if (password.length < 8) return setError('Choose a longer password: at least 8 characters.')
    setBusy(true)
    setError(null)
    try {
      await cloud.setPassword(password)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="account-form" onSubmit={submit}>
      <h2 className="confirm-title">Choose a new password</h2>
      <label className="field">
        <span className="field-label">New password</span>
        <input className="plain-input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        <span className="field-hint">At least 8 characters.</span>
      </label>
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="form-actions account-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'One moment…' : 'Save password'}
        </button>
        <button type="button" className="btn ghost" onClick={() => cloud?.cancelRecovery()}>
          Not now
        </button>
      </div>
    </form>
  )
}

function AccountView({ onClose }: { onClose: () => void }) {
  const state = useCloud((s) => s)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { text, tone } = standing(state)

  useEffect(() => {
    void cloud?.refreshStories().catch(() => {})
  }, [])

  /** Runs an account action, showing what goes wrong. */
  const run = async (name: string, action: () => Promise<unknown>) => {
    setBusy(name)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const signOut = async () => {
    if (state.pending) {
      const ok = await askConfirm({
        title: 'Sign out before the latest changes are saved?',
        message: 'This story’s latest changes aren’t in your account yet (there’s no connection). They stay in this browser, but won’t reach your account.',
        confirmLabel: 'Sign out',
        danger: true,
      })
      if (!ok) return
    }
    await run('sign-out', async () => {
      await cloud!.signOut()
      onClose()
    })
  }

  const remove = async (id: string, title: string) => {
    const ok = await askConfirm({
      title: `Delete “${title || 'Untitled story'}” from your account?`,
      message: 'It’s deleted for good, in every browser. (A copy you exported, or a backup in a browser it was open in, isn’t affected.)',
      confirmLabel: 'Delete story',
      danger: true,
    })
    if (ok) await run(`delete-${id}`, () => cloud!.deleteStory(id))
  }

  const stories = state.stories ?? []
  return (
    <div className="account-view">
      <h2 className="confirm-title">Your account</h2>
      <p className="account-email">{state.user?.email}</p>
      <p className={`account-standing ${tone}`}>
        {state.status === 'offline' ? <CloudOff size={15} /> : <span className={`sync-dot ${tone}`} aria-hidden />}
        <span>{text}</span>
        {(state.status === 'offline' || state.status === 'error') && (
          <button className="link-btn" onClick={() => void cloud?.resume()}>
            <RefreshCw size={13} /> Try again
          </button>
        )}
      </p>

      {state.status === 'conflict' && (
        <div className="account-ask" role="group" aria-label="Which version to keep">
          <p>
            <CircleAlert size={16} /> Since this browser last saved this story to your account, it was changed and saved somewhere else too. Which
            version should it be?
          </p>
          <div className="account-ask-actions">
            <button className="btn primary" disabled={!!busy} onClick={() => void run('mine', () => cloud!.keepThisVersion())}>
              Keep this browser’s
            </button>
            <button className="btn ghost" disabled={!!busy} onClick={() => void run('theirs', () => cloud!.takeOtherVersion())}>
              Use the other one
            </button>
          </div>
          <p className="account-small">The one not kept is saved in this browser’s backups (⋯ → Backups).</p>
        </div>
      )}

      {state.status === 'unlinked' && (
        <div className="account-ask" role="group" aria-label="What to open here">
          <p>Your account has {stories.length === 1 ? 'a story' : 'stories'} already. Open one here, or add the story that’s in this browser to your account as well.</p>
          <div className="account-ask-actions">
            <button className="btn primary" disabled={!!busy} onClick={() => void run('add', () => cloud!.addThisStory())}>
              <BookPlus size={15} /> Add this browser’s story
            </button>
          </div>
          <p className="account-small">Opening one keeps a backup of this browser’s story (⋯ → Backups).</p>
        </div>
      )}

      <div className="account-stories-head">
        <h3 className="progress-heading">Your stories</h3>
        {state.status !== 'unlinked' && (
          <button
            className="btn ghost small"
            disabled={!!busy || state.status === 'conflict'}
            onClick={() => void run('new', () => cloud!.newStory(buildBlankStory()))}
          >
            <BookPlus size={15} /> New story
          </button>
        )}
      </div>
      {state.stories === null ? (
        <p className="account-small">Loading…</p>
      ) : stories.length === 0 ? (
        <p className="account-small">None yet.</p>
      ) : (
        <ul className="account-stories">
          {stories.map((s) => {
            const here = s.id === state.storyId
            return (
              <li key={s.id} className={here ? 'here' : undefined}>
                <span className="account-story-title">{s.title || 'Untitled story'}</span>
                <span className="account-story-when">{here ? 'Open here' : `Saved ${when(s.updatedAt)}`}</span>
                {!here && (
                  <>
                    <button
                      className="btn ghost small"
                      disabled={!!busy || state.status === 'conflict'}
                      onClick={() => void run(`open-${s.id}`, () => cloud!.openStory(s.id))}
                    >
                      {busy === `open-${s.id}` ? 'Opening…' : 'Open'}
                    </button>
                    <button className="icon-btn" disabled={!!busy} onClick={() => void remove(s.id, s.title)} aria-label={`Delete ${s.title || 'Untitled story'}`} title="Delete from your account">
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="account-error" role="alert">{error}</p>}
      <AssistantLinks />
      <div className="form-actions account-actions">
        <button className="btn ghost" disabled={busy === 'sign-out'} onClick={() => void signOut()}>
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  )
}
