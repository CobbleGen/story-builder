import { createClient, type User } from '@supabase/supabase-js'
import { CloudError, type CloudBackend, type CloudStoryRow, type CloudUser } from './backend'

// The backend on Supabase: its accounts (email and password), a `stories`
// table that each account sees only its own rows of, and a private
// `pictures` bucket with a folder per account (see supabase/migrations).

const ROW = 'id, title, version, updated_at'
type Row = { id: string; title: string; version: number; updated_at: string }
const toRow = (r: Row): CloudStoryRow => ({ id: r.id, title: r.title, version: r.version, updatedAt: r.updated_at })
const toUser = (u: User): CloudUser => ({ id: u.id, email: u.email ?? '' })

/** Where links in account emails (confirming it, resetting the password) bring people back to: this app. */
const here = () => `${location.origin}${location.pathname}`

const FRIENDLY: [RegExp, string][] = [
  [/invalid login credentials/i, 'That email and password don’t match an account.'],
  [/email not confirmed/i, 'Confirm your email address first: follow the link in the email we sent you.'],
  [/already registered|already been registered|already exists/i, 'There’s already an account with that email address. Sign in instead.'],
  [/rate limit|too many/i, 'Too many tries just now. Wait a little and try again.'],
  [/password should be|weak password/i, 'Choose a longer password: at least 8 characters.'],
  [/unable to validate email|invalid email|invalid format/i, 'That doesn’t look like an email address.'],
  [/same.*password|different from the old/i, 'Choose a password different from your old one.'],
]

/** A Supabase error as a CloudError the writer can read. */
function fail(error: { message?: string; status?: number; name?: string } | null | undefined, fallback: string): never {
  const message = error?.message ?? ''
  if (/fetch|network|timed? ?out|load failed/i.test(message) || error?.name === 'AuthRetryableFetchError') {
    throw new CloudError('Can’t reach your account just now. Check the connection.', true)
  }
  const friendly = FRIENDLY.find(([re]) => re.test(message))
  throw new CloudError(friendly ? friendly[1] : message || fallback)
}

export function supabaseBackend(url: string, key: string): CloudBackend {
  const client = createClient(url, key, {
    // Links in emails come back with ?code= (not a #fragment, which the app's routes use).
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  const pictures = () => client.storage.from('pictures')

  return {
    onAuthChange(callback) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        const user = session?.user ? toUser(session.user) : null
        // Supabase asks not to call it back from inside this callback.
        setTimeout(() => {
          if (event === 'PASSWORD_RECOVERY') callback('password-recovery', user)
          else if (event === 'SIGNED_OUT' || !user) callback('signed-out', null)
          else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') callback('signed-in', user)
        })
      })
      return () => data.subscription.unsubscribe()
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (error || !data.user) fail(error, 'Couldn’t sign in.')
      return toUser(data.user)
    },

    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: here() } })
      if (error) fail(error, 'Couldn’t create the account.')
      // An address already signed up comes back as a user with no identities.
      if (data.user && !data.user.identities?.length) fail({ message: 'already registered' }, '')
      return data.session && data.user ? toUser(data.user) : null
    },

    async sendPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: here() })
      if (error) fail(error, 'Couldn’t send the email.')
    },

    async setPassword(password) {
      const { error } = await client.auth.updateUser({ password })
      if (error) fail(error, 'Couldn’t change the password.')
    },

    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) fail(error, 'Couldn’t sign out.')
    },

    async listStories() {
      const { data, error } = await client.from('stories').select(ROW).order('updated_at', { ascending: false })
      if (error) fail(error, 'Couldn’t list your stories.')
      return (data as Row[]).map(toRow)
    },

    async getStory(id) {
      const { data, error } = await client.from('stories').select(`${ROW}, data`).eq('id', id).maybeSingle()
      if (error) fail(error, 'Couldn’t open the story.')
      return data ? { row: toRow(data as Row), data: (data as { data: unknown }).data } : null
    },

    async getVersion(id) {
      const { data, error } = await client.from('stories').select('version').eq('id', id).maybeSingle()
      if (error) fail(error, 'Couldn’t check the story.')
      return data ? (data as { version: number }).version : null
    },

    async createStory(title, data) {
      const { data: row, error } = await client.from('stories').insert({ title, data }).select(ROW).single()
      if (error || !row) fail(error, 'Couldn’t save the story to your account.')
      return toRow(row as Row)
    },

    async saveStory(id, title, data, version) {
      const { data: rows, error } = await client.from('stories').update({ title, data }).eq('id', id).eq('version', version).select(ROW)
      if (error) fail(error, 'Couldn’t save the story to your account.')
      return rows?.length ? toRow(rows[0] as Row) : null
    },

    async deleteStory(id) {
      const { error } = await client.from('stories').delete().eq('id', id)
      if (error) fail(error, 'Couldn’t delete the story.')
    },

    async listPictures(userId) {
      const ids: string[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await pictures().list(userId, { limit: 1000, offset })
        if (error) fail(error, 'Couldn’t list your pictures.')
        ids.push(...data.map((f) => f.name))
        if (data.length < 1000) return ids
      }
    },

    async uploadPicture(userId, id, blob) {
      const { error } = await pictures().upload(`${userId}/${id}`, blob, { upsert: true, contentType: blob.type || 'image/png' })
      if (error) fail(error, 'Couldn’t save a picture to your account.')
    },

    async downloadPicture(userId, id) {
      const { data, error } = await pictures().download(`${userId}/${id}`)
      if (error) {
        if (/not found|404|400/i.test(`${error.message} ${(error as { status?: number }).status ?? ''}`)) return null
        fail(error, 'Couldn’t load a picture from your account.')
      }
      return data
    },
  }
}
