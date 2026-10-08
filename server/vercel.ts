import { getRequestListener } from '@hono/node-server'
import { handleRequest } from './mcp'

// The function Vercel runs at /mcp (bundled by scripts/vercel-output.mjs):
// the story server for AI assistants, reading the account store the app uses
// (its address and public key come from .env at build time).

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const apiKey = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export default getRequestListener((request) => handleRequest(request, url && apiKey ? { url, apiKey } : null))
