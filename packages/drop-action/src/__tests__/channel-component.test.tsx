import { render } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createDropAction } from '../main'

// createDropAction returns the channel as a function component carrying its
// members, not a plain object (ADR-0015). The component shape is what makes a
// `export const DA = createDropAction(...)` module a valid React Fast Refresh
// boundary; the function itself is the channel and is not meant to be
// rendered.
describe('createDropAction returns a channel component (ADR-0015)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('returns a function carrying its members as statics', () => {
    const DA = createDropAction()

    expect(typeof DA).toBe('function')
    // Uppercase name so react-refresh's isLikelyComponentType treats the
    // exporting module as a refresh boundary.
    expect(/^[A-Z]/.test(DA.name)).toBe(true)

    const members = [
      'Item',
      'Zone',
      'Active',
      'useItem',
      'useZone',
      'useDragHandle',
      'useActive',
      'useResolution',
      'useOver',
    ] as const
    for (const member of members) expect(typeof DA[member]).toBe('function')
  })

  test('rendering the channel directly warns in dev and renders nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const DA = createDropAction()

    const { container } = render(<DA />)

    expect(container).toBeEmptyDOMElement()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('createDropAction'),
    )
  })
})
