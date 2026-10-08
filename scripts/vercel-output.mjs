// Writes what Vercel deploys, after `vite build` (Vercel's Build Output API,
// in .vercel/output): the app as built in dist/, and the story server for AI
// assistants (server/vercel.ts) as one function at /mcp. The server is
// bundled into a single file because it shares the app's code, which Vercel's
// own Node builder can't load as it stands (it imports without extensions).
import { cpSync, rmSync, writeFileSync } from 'node:fs'
import { build } from 'vite'

const out = '.vercel/output'
const fn = `${out}/functions/mcp.func`

rmSync(out, { recursive: true, force: true })
cpSync('dist', `${out}/static`, { recursive: true })

await build({
  configFile: false,
  logLevel: 'warn',
  publicDir: false,
  // The app's backups name the build they were made by; the server never makes any.
  define: { __BUILD_ID__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'server') },
  ssr: { noExternal: true },
  build: {
    ssr: 'server/vercel.ts',
    outDir: fn,
    emptyOutDir: false,
    minify: false,
    target: 'node22',
    rolldownOptions: { output: { format: 'es', entryFileNames: 'index.mjs', codeSplitting: false } },
  },
})

writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false }, null, 2),
)
// /mcp/<key> goes to the function, which finds the key in the path or in ?key=.
// Vercel adds the routes that serve the app's files and its 404 page.
writeFileSync(`${out}/config.json`, JSON.stringify({ version: 3, routes: [{ src: '^/mcp/([^/]+)/?$', dest: '/mcp?key=$1' }] }, null, 2))
console.log(`Wrote ${out}: the app, and the story server at /mcp`)
