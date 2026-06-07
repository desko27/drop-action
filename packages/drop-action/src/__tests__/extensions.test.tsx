import { afterEach, describe, expect, test, vi } from 'vitest'
import { createDropAction } from '../main'
import type { Extension } from '../main'

// Extensions inject members into the channel namespace (ADR-0025): `.extend(...)`
// applies one or more, each reading the channel and returning members to merge.
describe('Extensions — namespace injection (ADR-0025)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('.extend merges an Extension’s members under the namespace', () => {
    const stamp: Extension<{ stamp: () => string }> = () => ({
      stamp: () => 'hi',
    })

    const DA = createDropAction().extend(stamp)

    expect(typeof DA.stamp).toBe('function')
    expect(DA.stamp()).toBe('hi')
    // Core members are untouched.
    expect(typeof DA.useOver).toBe('function')
    expect(typeof DA.useDwell).toBe('function')
  })

  test('an Extension receives the channel and can read its public members', () => {
    const probe: Extension<{ hasOver: () => boolean }> = (channel) => {
      const c = channel as { useOver?: unknown }
      return { hasOver: () => typeof c.useOver === 'function' }
    }

    const DA = createDropAction().extend(probe)

    expect(DA.hasOver()).toBe(true)
  })

  test('.extend applies multiple Extensions in one call', () => {
    const a: Extension<{ a: () => number }> = () => ({ a: () => 1 })
    const b: Extension<{ b: () => number }> = () => ({ b: () => 2 })

    const DA = createDropAction().extend(a, b)

    expect(DA.a()).toBe(1)
    expect(DA.b()).toBe(2)
  })

  test('overriding an existing member warns in dev (Extensions are additive)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const clash: Extension = () => ({ useOver: () => null })

    createDropAction().extend(clash)

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('overrides existing member'),
    )
  })
})
