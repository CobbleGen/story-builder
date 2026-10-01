import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works from any folder (the app uses hash routing).
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || `local-${Date.now()}`),
  },
  plugins: [react()],
  // The Word exporter is only imported when exporting; bundle it up front so
  // the dev server doesn't reload the page the first time it's used.
  optimizeDeps: { include: ['docx', '@tiptap/pm/state', '@tiptap/pm/view'] },
})
