import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// vite-plugin-dts emits one rolled-up .d.ts per entry. Consumers using
// `require('drop-action')` resolve through the `require` condition of
// exports, which (per publint --strict) must point at a .d.cts file, not
// the ESM .d.ts. These entries have only named exports, so each .d.ts is
// copy-safe as-is; the extra rewrite react-call needs for default-export
// entries is unnecessary until drop-action grows a default-export subpath.
//
// `snap-back` is the first opt-in subpath module (ADR-0004). It ships as a
// second lib entry with its own export condition and .d.cts, establishing
// the packaging pattern future modules follow. It is not imported by
// `main`, so importing `drop-action` pulls none of its code.
const ENTRY_NAMES = ['main', 'snap-back', 'auto-scroll'] as const

const copyDtsToCts = {
  name: 'copy-dts-to-cts',
  closeBundle: async () => {
    for (const base of ENTRY_NAMES) {
      const src = resolve(import.meta.dirname, `dist/${base}.d.ts`)
      const dst = resolve(import.meta.dirname, `dist/${base}.d.cts`)
      const content = await readFile(src, 'utf-8')
      await writeFile(dst, content)
    }
  },
}

export default defineConfig({
  plugins: [
    react(),
    dts({
      bundleTypes: true,
      insertTypesEntry: true,
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/__tests__/**'],
    }),
    copyDtsToCts,
  ],
  build: {
    copyPublicDir: false,
    lib: {
      entry: {
        main: resolve(import.meta.dirname, 'src/main.ts'),
        'snap-back': resolve(import.meta.dirname, 'src/snap-back.tsx'),
        'auto-scroll': resolve(import.meta.dirname, 'src/auto-scroll.tsx'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, name) => `${name}.${format === 'cjs' ? 'cjs' : 'js'}`,
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'react-dom'],
    },
  },
})
