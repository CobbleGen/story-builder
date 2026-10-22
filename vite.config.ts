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
  // The Word exporter, and the Word and Markdown readers, are only imported
  // when used; bundle them up front so the dev server doesn't reload the page
  // the first time one is.
  optimizeDeps: { include: ['docx', 'mammoth', 'marked', '@tiptap/pm/state', '@tiptap/pm/view'] },
})
