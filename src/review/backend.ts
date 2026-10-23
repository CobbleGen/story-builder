import type { CommentRow } from '../cloud/backend'

// What an editor's review needs from the account service, through the
// review link's token alone (no account): the story, its comments, and its
// pictures. Supabase provides it (supabaseReview.ts); browser tests use a
// stand-in.

/** The story a review link opens. */
export interface ReviewStory {
  id: string
  /** The writer's account, whose folder the pictures are in. */
  owner: string
  title: string
  /** Who the writer made the link for. */
  label: string
  /** When the story was last saved (ISO date). */
  updatedAt: string
  data: unknown
}

/** `me`: a secret this browser keeps, so the editor can change and delete their own comments. */
export interface ReviewBackend {
  open(): Promise<ReviewStory>
  listComments(me: string): Promise<CommentRow[]>
  addComment(me: string, name: string, thread: string | null, target: unknown, body: string): Promise<string>
  resolveComment(name: string, id: string, resolved: boolean): Promise<void>
  editComment(me: string, id: string, body: string): Promise<void>
  removeComment(me: string, id: string): Promise<void>
  downloadPicture(owner: string, id: string): Promise<Blob | null>
}

/** The link no longer opens the story (turned off, or never whole). */
export class LinkGone extends Error {
  constructor() {
    super('This review link doesn’t open a story any more: the writer may have turned it off. Ask them for a new one.')
    this.name = 'LinkGone'
  }
}
