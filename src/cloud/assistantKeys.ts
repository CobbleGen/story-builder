// Keys for the links an AI assistant reads the account's stories through
// (see server/mcp.ts and supabase/migrations): made here, shown to the writer
// once, and kept in the account only as a fingerprint.

/** A new key: 32 random bytes as base64url, 43 characters. */
export function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** A key's fingerprint, as the account keeps it: SHA-256, in hex. */
export async function keyHash(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The link an assistant connects to, on this site. */
export const assistantUrl = (key: string, origin = location.origin) => `${origin}/mcp/${key}`
