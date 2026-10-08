import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { StoryData } from '../types'
import { emptyStory, normalizeStory } from '../store/storyOps'
import { CloudError, type AssistantLink, type AuthEvent, type CloudBackend, type CloudStoryRow, type CloudUser } from './backend'
import { createCloud, type Link } from './engine'

/** An account service in memory: its accounts, stories and pictures, shared by every "device". */
function memoryService() {
  const users = new Map<string, { user: CloudUser; password: string; confirmed: boolean }>()
  const stories = new Map<string, { owner: string; row: CloudStoryRow; data: unknown }>()
  const pictures = new Map<string, Blob>()
  const links = new Map<string, { owner: string; link: AssistantLink; keyHash: string }>()
  let online = true
  let next = 1
  const stamp = () => new Date(Date.now() + next++).toISOString()

  /** One browser's connection to it, with its own sign-in. */
  function device(): CloudBackend {
    let current: CloudUser | null = null
    const listeners = new Set<(event: AuthEvent, user: CloudUser | null) => void>()
    const emit = (event: AuthEvent) => listeners.forEach((l) => l(event, current))
    const reach = () => {
      if (!online) throw new CloudError('Can’t reach your account just now.', true)
    }
    const me = () => {
      reach()
      if (!current) throw new CloudError('Not signed in.')
      return current
    }
    const mine = (id: string) => {
      const s = stories.get(id)
      return s && s.owner === me().id ? s : null
    }
    return {
      onAuthChange(callback) {
        listeners.add(callback)
        callback(current ? 'signed-in' : 'signed-out', current)
        return () => listeners.delete(callback)
      },
      async signIn(email, password) {
        reach()
        const found = users.get(email)
        if (!found || found.password !== password) throw new CloudError('That email and password don’t match an account.')
        if (!found.confirmed) throw new CloudError('Confirm your email address first.')
        current = found.user
        emit('signed-in')
        return current
      },
      async signUp(email, password) {
        reach()
        if (users.has(email)) throw new CloudError('There’s already an account with that email address.')
        users.set(email, { user: { id: `user-${next++}`, email }, password, confirmed: false })
        return null
      },
      async sendPasswordReset() {
        reach()
      },
      async setPassword(password) {
        const user = me()
        users.get(user.email)!.password = password
      },
      async signOut() {
        current = null
        emit('signed-out')
      },
      async listStories() {
        const id = me().id
        return [...stories.values()].filter((s) => s.owner === id).map((s) => ({ ...s.row }))
      },
      async getStory(id) {
        const s = mine(id)
        return s ? { row: { ...s.row }, data: structuredClone(s.data) } : null
      },
      async getVersion(id) {
        return mine(id)?.row.version ?? null
      },
      async createStory(title, data) {
        const row = { id: `story-${next++}`, title, version: 1, updatedAt: stamp() }
        stories.set(row.id, { owner: me().id, row, data: structuredClone(data) })
        return { ...row }
      },
      async saveStory(id, title, data, version) {
        const s = mine(id)
        if (!s || s.row.version !== version) return null
        s.row = { ...s.row, title, version: version + 1, updatedAt: stamp() }
        s.data = structuredClone(data)
        return { ...s.row }
      },
      async deleteStory(id) {
        if (mine(id)) stories.delete(id)
      },
      async listAssistantLinks() {
        const id = me().id
        return [...links.values()].filter((l) => l.owner === id).map((l) => ({ ...l.link })).reverse()
      },
      async addAssistantLink(label, keyHash, hint) {
        const link = { id: `link-${next++}`, label, hint, createdAt: stamp(), lastUsedAt: null }
        links.set(link.id, { owner: me().id, link, keyHash })
        return { ...link }
      },
      async revokeAssistantLink(id) {
        if (links.get(id)?.owner === me().id) links.delete(id)
      },
      async listPictures(userId) {
        me()
        return [...pictures.keys()].filter((k) => k.startsWith(`${userId}/`)).map((k) => k.split('/')[1])
      },
      async uploadPicture(userId, id, blob) {
        if (me().id !== userId) throw new CloudError('Not yours.')
        pictures.set(`${userId}/${id}`, blob)
      },
      async downloadPicture(userId, id) {
        if (me().id !== userId) return null
        return pictures.get(`${userId}/${id}`) ?? null
      },
    }
  }

  return {
    device,
    stories,
    pictures,
    links,
    confirm: (email: string) => (users.get(email)!.confirmed = true),
    setOnline: (value: boolean) => (online = value),
  }
}

/** A browser: its story, backups, saved link and pictures, and the engine keeping them in step with the account. */
function browser(service: ReturnType<typeof memoryService>, title: string, images: Record<string, Blob> = {}) {
  let story: StoryData = { ...emptyStory(title) }
  let link: Link | null = null
  const listeners = new Set<() => void>()
  const backups: StoryData[] = []
  const backend = service.device()
  const cloud = createCloud({
    backend: async () => backend,
    story: {
      read: () => story,
      prepare: (data) => normalizeStory(data),
      load: (data) => {
        story = data
        listeners.forEach((l) => l())
      },
      subscribe: (onChange) => {
        listeners.add(onChange)
        return () => listeners.delete(onChange)
      },
      backup: async (data) => {
        backups.push(data ?? story)
      },
    },
    pictures: {
      idsIn: (data) => Object.keys(images).filter((id) => JSON.stringify(data).includes(id)),
      get: async (id) => images[id],
    },
    links: { read: () => link, write: (l) => (link = l) },
    saveDelay: 5,
    maxWait: 40,
    retryDelay: 1000,
  })
  cloud.start({ connect: true })
  return {
    cloud,
    backups,
    state: () => cloud.store.getState(),
    story: () => story,
    link: () => link,
    edit: (patch: Partial<StoryData>) => {
      story = { ...story, ...patch }
      listeners.forEach((l) => l())
    },
  }
}

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

describe('keeping the story in step with the account', () => {
  it('creates an account, and puts this browser’s story in it as its first', async () => {
    const service = memoryService()
    const a = browser(service, 'My Novel')
    await settle()
    expect(a.state().status).toBe('signed-out')
    // Sign-up needs the address confirmed first
    expect(await a.cloud.signUp(' writer@example.com ', 'longpassword')).toBe(false)
    await expect(a.cloud.signIn('writer@example.com', 'longpassword')).rejects.toThrow(/confirm/i)
    service.confirm('writer@example.com')
    await expect(a.cloud.signIn('writer@example.com', 'wrong')).rejects.toThrow(/don’t match/)
    await a.cloud.signIn('writer@example.com', 'longpassword')
    await settle()
    expect(a.state()).toMatchObject({ status: 'synced', user: { email: 'writer@example.com' } })
    const saved = [...service.stories.values()]
    expect(saved).toHaveLength(1)
    expect((saved[0].data as StoryData).title).toBe('My Novel')
    expect(a.link()).toMatchObject({ version: 1, dirty: false })
  })

  it('saves changes a moment after they’re made, and picks up changes made in another browser', async () => {
    const service = memoryService()
    const a = browser(service, 'My Novel')
    await a.cloud.signUp('w@example.com', 'longpassword')
    service.confirm('w@example.com')
    await a.cloud.signIn('w@example.com', 'longpassword')
    await settle()
    a.edit({ title: 'My Novel, revised' })
    expect(a.state().pending).toBe(true)
    await settle()
    expect(a.state()).toMatchObject({ status: 'synced', pending: false })
    const id = a.link()!.storyId
    expect(service.stories.get(id)!.row).toMatchObject({ version: 2, title: 'My Novel, revised' })

    // Another browser, with a story of its own: it asks what to open
    const b = browser(service, 'Scratch')
    await b.cloud.signIn('w@example.com', 'longpassword')
    await settle()
    expect(b.state().status).toBe('unlinked')
    expect(b.state().stories?.map((s) => s.title)).toEqual(['My Novel, revised'])
    await b.cloud.openStory(id)
    expect(b.story().title).toBe('My Novel, revised')
    // Its own story was kept as a backup
    expect(b.backups.map((s) => s.title)).toEqual(['Scratch'])
    expect(b.state().status).toBe('synced')

    // Changed in the first browser; the second picks it up when it comes back into view
    a.edit({ title: 'Third draft' })
    await settle()
    await b.cloud.resume()
    expect(b.story().title).toBe('Third draft')
    expect(b.link()).toMatchObject({ version: 3, dirty: false })
  })

  it('never saves over changes made elsewhere: the writer picks which version to keep', async () => {
    const service = memoryService()
    const a = browser(service, 'Shared')
    await a.cloud.signUp('w@example.com', 'longpassword')
    service.confirm('w@example.com')
    await a.cloud.signIn('w@example.com', 'longpassword')
    await settle()
    const id = a.link()!.storyId
    const b = browser(service, 'Other')
    await b.cloud.signIn('w@example.com', 'longpassword')
    await settle()
    await b.cloud.openStory(id)

    // Both change it; the first saves first
    a.edit({ title: 'From A' })
    await settle()
    b.edit({ title: 'From B' })
    await settle()
    expect(b.state().status).toBe('conflict')
    expect(service.stories.get(id)!.row.title).toBe('From A')
    // Nothing else can be opened until it's settled
    await expect(b.cloud.newStory(emptyStory('New'))).rejects.toThrow(/which version/)

    // Keep B's: it goes to the account, and A's is kept in B's backups
    await b.cloud.keepThisVersion()
    expect(b.state().status).toBe('synced')
    expect(service.stories.get(id)!.row.title).toBe('From B')
    expect(b.backups.map((s) => s.title)).toContain('From A')
    await a.cloud.resume()
    expect(a.story().title).toBe('From B')

    // Again, but take the other one: B's own is backed up and replaced
    a.edit({ title: 'A again' })
    await settle()
    b.edit({ title: 'B again' })
    await settle()
    expect(b.state().status).toBe('conflict')
    await b.cloud.takeOtherVersion()
    expect(b.story().title).toBe('A again')
    expect(b.backups.at(-1)?.title).toBe('B again')
    expect(b.state()).toMatchObject({ status: 'synced', pending: false })
  })

  it('keeps working offline, and saves when the account can be reached again', async () => {
    const service = memoryService()
    const a = browser(service, 'Offline')
    await a.cloud.signUp('w@example.com', 'longpassword')
    service.confirm('w@example.com')
    await a.cloud.signIn('w@example.com', 'longpassword')
    await settle()
    service.setOnline(false)
    a.edit({ title: 'Written on a train' })
    await settle()
    expect(a.state()).toMatchObject({ status: 'offline', pending: true })
    service.setOnline(true)
    await a.cloud.resume()
    expect(a.state()).toMatchObject({ status: 'synced', pending: false })
    expect(service.stories.get(a.link()!.storyId)!.row.title).toBe('Written on a train')
  })

  it('starts new stories in the account, deletes others, and lets go of one deleted elsewhere', async () => {
    const service = memoryService()
    const a = browser(service, 'First')
    await a.cloud.signUp('w@example.com', 'longpassword')
    service.confirm('w@example.com')
    await a.cloud.signIn('w@example.com', 'longpassword')
    await settle()
    const first = a.link()!.storyId
    await a.cloud.newStory(emptyStory('Second'))
    expect(a.story().title).toBe('Second')
    const second = a.link()!.storyId
    expect(second).not.toBe(first)
    expect(service.stories.size).toBe(2)
    // Not the one open here
    await expect(a.cloud.deleteStory(second)).rejects.toThrow(/open here/)

    // Deleted from another browser while open here: the next save finds it gone, and asks
    const b = browser(service, 'Elsewhere')
    await b.cloud.signIn('w@example.com', 'longpassword')
    await settle()
    await b.cloud.openStory(first)
    await b.cloud.deleteStory(second)
    a.edit({ title: 'Second, edited' })
    await settle()
    expect(a.state().status).toBe('unlinked')
    expect(a.link()).toBeNull()
    // The story is still here, and can go back in as a new one
    await a.cloud.addThisStory()
    expect(a.state().status).toBe('synced')
    expect([...service.stories.values()].map((s) => s.row.title).sort()).toEqual(['First', 'Second, edited'])
  })

  it('saves the story’s pictures to the account, for other browsers to fetch', async () => {
    const service = memoryService()
    const picture = new Blob(['png bytes'], { type: 'image/png' })
    const a = browser(service, 'Pictures', { img_abc123: picture, img_unused: picture })
    await a.cloud.signUp('w@example.com', 'longpassword')
    service.confirm('w@example.com')
    await a.cloud.signIn('w@example.com', 'longpassword')
    await settle()
    a.edit({ title: 'With img_abc123 in it' })
    await settle()
    const owner = a.state().user!.id
    expect([...service.pictures.keys()]).toEqual([`${owner}/img_abc123`])
    const b = browser(service, 'Other')
    expect(await b.cloud.fetchPicture('img_abc123')).toBeNull()
    await b.cloud.signIn('w@example.com', 'longpassword')
    await settle()
    expect(await b.cloud.fetchPicture('img_abc123')).toBe(picture)
  })

  it('signs out, leaving the story in this browser', async () => {
    const service = memoryService()
    const a = browser(service, 'Mine')
    await a.cloud.signUp('w@example.com', 'longpassword')
    service.confirm('w@example.com')
    await a.cloud.signIn('w@example.com', 'longpassword')
    await settle()
    a.edit({ title: 'Mine, last change' })
    await a.cloud.signOut()
    // Its last change was saved first
    expect([...service.stories.values()][0].row.title).toBe('Mine, last change')
    expect(a.state()).toMatchObject({ status: 'signed-out', user: null, storyId: null })
    expect(a.link()).toBeNull()
    expect(a.story().title).toBe('Mine, last change')
    // Changes after signing out stay here
    a.edit({ title: 'Offline only' })
    await settle()
    expect([...service.stories.values()][0].row.title).toBe('Mine, last change')
  })

  it('makes links for AI assistants, keeping only a fingerprint of each key', async () => {
    const service = memoryService()
    const a = browser(service, 'Mine')
    await a.cloud.signUp('w@example.com', 'longpassword')
    service.confirm('w@example.com')
    await a.cloud.signIn('w@example.com', 'longpassword')
    await settle()
    const { link, key } = await a.cloud.createAssistantLink('  Claude  ')
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(link).toMatchObject({ label: 'Claude', hint: key.slice(-4), lastUsedAt: null })
    const kept = service.links.get(link.id)!
    expect(kept.keyHash).toBe(createHash('sha256').update(key).digest('hex'))
    expect(JSON.stringify([...service.links.values()])).not.toContain(key)
    // Every key is new
    const second = await a.cloud.createAssistantLink('Another')
    expect(second.key).not.toBe(key)
    expect((await a.cloud.listAssistantLinks()).map((l) => l.label)).toEqual(['Another', 'Claude'])
    await a.cloud.revokeAssistantLink(link.id)
    expect((await a.cloud.listAssistantLinks()).map((l) => l.label)).toEqual(['Another'])
  })
})
