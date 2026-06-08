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

  // The first opt-in subpath module (drop-action/snap-back, ADR-0004) ships
  // its own ESM/CJS + types pair under the same packaging pattern.
  it('snap-back bundle exposes snapBack', async () => {
    const code = await readFile(resolve(DIST, 'snap-back.js'), 'utf-8')
    expect(code).toContain('snapBack')
  })

  it.each([
    'snap-back.js',
    'snap-back.cjs',
    'snap-back.d.ts',
    'snap-back.d.cts',
  ])('ships dist/%s', async (filename) => {
    await expect(
      readFile(resolve(DIST, filename), 'utf-8'),
    ).resolves.toBeTruthy()
  })

  // Tree-shakeable: the core entry must not pull any snap-back code, so a
  // consumer who never imports drop-action/snap-back ships none of it.
  it('main bundle pulls no snap-back code', async () => {
    const code = await readFile(resolve(DIST, 'main.js'), 'utf-8')
    expect(code).not.toContain('snapBack')
    expect(code).not.toContain('SnapBack')
  })

  // The auto-scroll subpath module (drop-action/auto-scroll, ADR-0033) ships its
  // own ESM/CJS + types pair under the same packaging pattern.
  it('auto-scroll bundle exposes autoScroll', async () => {
    const code = await readFile(resolve(DIST, 'auto-scroll.js'), 'utf-8')
    expect(code).toContain('autoScroll')
  })

  it.each([
    'auto-scroll.js',
    'auto-scroll.cjs',
    'auto-scroll.d.ts',
    'auto-scroll.d.cts',
  ])('ships dist/%s', async (filename) => {
    await expect(
      readFile(resolve(DIST, filename), 'utf-8'),
    ).resolves.toBeTruthy()
  })

  // Tree-shakeable: the core entry must not pull any auto-scroll code, so a
  // consumer who never imports drop-action/auto-scroll ships none of it.
  it('main bundle pulls no auto-scroll code', async () => {
    const code = await readFile(resolve(DIST, 'main.js'), 'utf-8')
    expect(code).not.toContain('autoScroll')
  })
})
