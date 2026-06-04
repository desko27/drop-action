import { defineConfig } from 'vitest/config'

// Tests that assert on the built artifact (run after `pnpm build`), kept
// out of the default unit run so `pnpm test` needs no prior build.
const DIST_TESTS = ['packages/*/src/**/bundle-content.test.ts']

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./packages/drop-action/src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/__tests__/**',
        '**/*.d.ts',
        // Type-only modules compile to nothing — no runtime to cover.
        '**/types.*.ts',
        // Re-export barrels carry no logic.
        'packages/*/src/main.ts',
      ],
      reporter: ['text', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.{ts,tsx}'],
          exclude: DIST_TESTS,
        },
      },
      {
        extends: true,
        test: {
          name: 'dist',
          include: DIST_TESTS,
        },
      },
    ],
  },
})
