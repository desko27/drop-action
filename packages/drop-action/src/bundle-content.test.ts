import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Runs against the built artifact (the `dist` Vitest project, after
// `pnpm build`). Pins that the publishable bundle ships both module
// formats with their matching type entries.
const DIST = resolve(import.meta.dirname, '..', 'dist')

describe('bundle content', () => {
  it('main bundle exposes createDropAction', async () => {
    const code = await readFile(resolve(DIST, 'main.js'), 'utf-8')
    expect(code).toContain('createDropAction')
  })

  it.each([
    'main.js',
    'main.cjs',
    'main.d.ts',
    'main.d.cts',
  ])('ships dist/%s', async (filename) => {
    await expect(
      readFile(resolve(DIST, filename), 'utf-8'),
    ).resolves.toBeTruthy()
  })
})
