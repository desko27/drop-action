import { describe, expect, test } from 'vitest'
import {
  closestCenter,
  pointerWithin,
  rectIntersection,
} from '../createDropAction/collision'
import type { Rect } from '../createDropAction/types.public'

const r = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
})

// Default pointer for detectors that ignore it; the center of overlayRect in
// the rectIntersection/closestCenter cases below, but irrelevant there.
const P = { x: 0, y: 0 }

// First test seam: each collision detector is a pure function, verified in
// isolation from any DOM or engine state (ADR-0006).
describe('rectIntersection', () => {
  test('returns the id of an overlapping Zone', () => {
    expect(
      rectIntersection({
        pointer: P,
        overlayRect: r(0, 0, 100, 100),
        zones: [{ id: 'a', rect: r(50, 0, 150, 100) }],
      }),
    ).toBe('a')
  })

  test('returns null when nothing overlaps', () => {
    expect(
      rectIntersection({
        pointer: P,
        overlayRect: r(0, 0, 10, 10),
        zones: [{ id: 'a', rect: r(50, 50, 100, 100) }],
      }),
    ).toBeNull()
  })

  test('picks the Zone with the largest overlap area', () => {
    expect(
      rectIntersection({
        pointer: P,
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
        pointer: P,
        overlayRect: r(0, 0, 100, 100),
        zones: [{ id: 'a', rect: r(100, 0, 200, 100) }],
      }),
    ).toBeNull()
  })

  test('ignores the pointer (decides purely by overlay overlap)', () => {
    // Pointer sits far outside every Zone, yet the overlapping Zone wins.
    expect(
      rectIntersection({
        pointer: { x: 9999, y: 9999 },
        overlayRect: r(0, 0, 100, 100),
        zones: [{ id: 'a', rect: r(50, 0, 150, 100) }],
      }),
    ).toBe('a')
  })
})

describe('pointerWithin', () => {
  test('returns the Zone whose rect contains the pointer', () => {
    expect(
      pointerWithin({
        pointer: { x: 75, y: 50 },
        overlayRect: r(0, 0, 100, 100),
        zones: [
          { id: 'left', rect: r(0, 0, 50, 100) },
          { id: 'right', rect: r(50, 0, 150, 100) },
        ],
      }),
    ).toBe('right')
  })

  test('returns null when the pointer is inside no Zone', () => {
    expect(
      pointerWithin({
        pointer: { x: 500, y: 500 },
        overlayRect: r(0, 0, 100, 100),
        zones: [{ id: 'a', rect: r(0, 0, 100, 100) }],
      }),
    ).toBeNull()
  })

  test('among overlapping Zones, picks the one whose center is closest', () => {
    // Pointer at (60,50) sits inside both Zones; 'small' is centered at
    // (50,50) (dist 10), 'big' at (100,50) (dist 40) — 'small' wins.
    expect(
      pointerWithin({
        pointer: { x: 60, y: 50 },
        overlayRect: r(0, 0, 100, 100),
        zones: [
          { id: 'big', rect: r(0, 0, 200, 100) },
          { id: 'small', rect: r(0, 0, 100, 100) },
        ],
      }),
    ).toBe('small')
  })

  test('ignores the overlay rect (decides purely by the pointer)', () => {
    expect(
      pointerWithin({
        pointer: { x: 250, y: 50 },
        overlayRect: r(0, 0, 100, 100),
        zones: [{ id: 'a', rect: r(200, 0, 300, 100) }],
      }),
    ).toBe('a')
  })
})

describe('closestCenter', () => {
  test('returns the Zone whose center is nearest the overlay center', () => {
    // Overlay center (50,50): 'near' center (60,50) vs 'far' center (250,50).
    expect(
      closestCenter({
        pointer: P,
        overlayRect: r(0, 0, 100, 100),
        zones: [
          { id: 'far', rect: r(200, 0, 300, 100) },
          { id: 'near', rect: r(10, 0, 110, 100) },
        ],
      }),
    ).toBe('near')
  })

  test('returns a Zone even with no overlap', () => {
    // No Zone overlaps the overlay, but closestCenter still picks the nearest.
    expect(
      closestCenter({
        pointer: P,
        overlayRect: r(0, 0, 100, 100),
        zones: [{ id: 'a', rect: r(500, 500, 600, 600) }],
      }),
    ).toBe('a')
  })

  test('returns null when there are no Zones', () => {
    expect(
      closestCenter({ pointer: P, overlayRect: r(0, 0, 100, 100), zones: [] }),
    ).toBeNull()
  })
})
