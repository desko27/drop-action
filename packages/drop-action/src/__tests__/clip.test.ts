import { describe, expect, test } from 'vitest'
import { clipToVisible, resolveClippers } from '../createDropAction/clip'
import type { Rect } from '../main'

const rect = (
  left: number,
  top: number,
  right: number,
  bottom: number,
): Rect => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
})

// A stand-in clipping ancestor: only its box is read by clipToVisible. happy-dom
// reports zero-sized rects for real nodes, so the box is pinned here.
const clipperAt = (
  left: number,
  top: number,
  right: number,
  bottom: number,
): Element =>
  ({
    getBoundingClientRect: () => rect(left, top, right, bottom),
  }) as unknown as Element

describe('clipToVisible (ADR-0023)', () => {
  test('with no clipping ancestors, returns the raw rect (within the viewport)', () => {
    const raw = rect(100, 100, 300, 200)
    expect(clipToVisible(raw, [])).toEqual(raw)
  })

  test('intersects the raw rect with a clipping ancestor box', () => {
    // A 400px-wide Zone (200..600) inside a 200px window (200..400): only the
    // left half is visible.
    const raw = rect(200, 0, 600, 100)
    const visible = clipToVisible(raw, [clipperAt(200, 0, 400, 100)])
    expect(visible).toEqual(rect(200, 0, 400, 100))
  })

  test('returns null when the Zone is clipped to nothing', () => {
    // The Zone (500..900) sits entirely outside the window (200..400).
    expect(
      clipToVisible(rect(500, 0, 900, 100), [clipperAt(200, 0, 400, 100)]),
    ).toBeNull()
  })

  test('intersects against every clipper in the chain', () => {
    const raw = rect(0, 0, 700, 700)
    const inner = clipperAt(200, 200, 400, 700)
    const outer = clipperAt(100, 100, 800, 600)
    expect(clipToVisible(raw, [inner, outer])).toEqual(rect(200, 200, 400, 600))
  })

  test('clips against the viewport even with no overflow ancestor', () => {
    // window is 1024x768 in happy-dom; a Zone past the bottom edge is trimmed.
    const visible = clipToVisible(rect(0, 700, 100, 900), [])
    expect(visible).toEqual(rect(0, 700, 100, 768))
  })
})

describe('resolveClippers (ADR-0023)', () => {
  test('collects ancestors whose overflow clips', () => {
    const scroller = document.createElement('div')
    scroller.style.overflow = 'scroll'
    const inner = document.createElement('div')
    const zone = document.createElement('div')
    inner.appendChild(zone)
    scroller.appendChild(inner)
    document.body.appendChild(scroller)
    expect(resolveClippers(zone)).toEqual([scroller])
    scroller.remove()
  })

  test('returns an empty chain when no ancestor clips', () => {
    const plain = document.createElement('div')
    const zone = document.createElement('div')
    plain.appendChild(zone)
    document.body.appendChild(plain)
    expect(resolveClippers(zone)).toEqual([])
    plain.remove()
  })
})
