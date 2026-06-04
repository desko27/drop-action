import { describe, expect, test } from 'vitest'
import { rectIntersection } from '../createDropAction/collision'
import type { Rect } from '../createDropAction/types.public'

const r = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
})

// First test seam: the collision detector is a pure function, verified in
// isolation from any DOM or engine state (ADR-0006).
describe('rectIntersection', () => {
  test('returns the id of an overlapping Zone', () => {
    expect(
      rectIntersection({
        overlayRect: r(0, 0, 100, 100),
        zones: [{ id: 'a', rect: r(50, 0, 150, 100) }],
      }),
    ).toBe('a')
  })

  test('returns null when nothing overlaps', () => {
    expect(
      rectIntersection({
        overlayRect: r(0, 0, 10, 10),
        zones: [{ id: 'a', rect: r(50, 50, 100, 100) }],
      }),
    ).toBeNull()
  })

  test('picks the Zone with the largest overlap area', () => {
    expect(
      rectIntersection({
        overlayRect: r(0, 0, 100, 100),
        zones: [
          { id: 'sliver', rect: r(90, 0, 200, 100) },
          { id: 'most', rect: r(0, 0, 80, 100) },
        ],
      }),
    ).toBe('most')
  })

  test('treats edge-only contact as no overlap', () => {
    expect(
      rectIntersection({
        overlayRect: r(0, 0, 100, 100),
        zones: [{ id: 'a', rect: r(100, 0, 200, 100) }],
      }),
    ).toBeNull()
  })
})
