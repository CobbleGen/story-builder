// Whether this page is an editor's review of someone's story, opened from a
// review link (…/?review=<token>). Then the story comes from the writer's
// account, read-only: nothing is saved in this browser or to any account,
// and the store turns down changes (see storyStore). Only comments are kept,
// in the writer's account.

const TOKEN = /^[A-Za-z0-9_-]{43}$/

const asked = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('review') : null

/** The review link's token; '' when the link is there but cut short. Null when this isn't a review. */
export const reviewToken: string | null = asked === null ? null : TOKEN.test(asked) ? asked : ''

export const reviewing = reviewToken !== null

/** A review link to a story, on this site. */
export const reviewUrl = (token: string, origin = location.origin) => `${origin}/?review=${token}`
