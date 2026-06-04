import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The demo is a development fixture, not a consumer. Vite resolves
// `drop-action` and its subpaths to packages/drop-action/src/ so library
// edits hot-reload without a build step; CI validates the publishable
// artifact separately.
const dropActionPath = (p: string) =>
  fileURLToPath(new URL(`../../packages/drop-action/${p}`, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^drop-action\/snap-back$/,
        replacement: dropActionPath('src/snap-back.tsx'),
      },
      { find: /^drop-action$/, replacement: dropActionPath('src/main.ts') },
    ],
  },
})
