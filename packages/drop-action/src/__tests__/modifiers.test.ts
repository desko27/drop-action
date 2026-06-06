import { describe, expect, test } from 'vitest'
import {
  restrictToHorizontalAxis,
  restrictToVerticalAxis,
  restrictToWindowEdges,
  snapToGrid,
} from '../createDropAction/modifiers'
import type { ModifierArgs, Transform } from '../createDropAction/types.public'

const rect = (
  left: number,
  top: number,
  right: number,
  bottom: number,
): ModifierArgs['overlayRect'] => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
})

// Build ModifierArgs with sensible defaults; tests override what matters.
// `overlayRect` is the Overlay's resting footprint (ADR-0020).
const args = (
  over: Partial<ModifierArgs> & { transform: Transform },
): ModifierArgs => ({
  overlayRect: rect(0, 0, 100, 100),
  pointer: { x: 0, y: 0 },
  windowWidth: 1024,
  windowHeight: 768,
  ...over,
})

// First test seam: each built-in is a pure function, verified against
// synthetic geometry with no DOM or engine state (ADR-0007).
describe('restrictToWindowEdges', () => {
  test('leaves a transform that keeps the Overlay inside the viewport untouched', () => {
    expect(
      restrictToWindowEdges(args({ transform: { x: 200, y: 100 } })),
    ).toEqual({ x: 200, y: 100 })
  })

  test('clamps the leading edge to the left/top of the viewport', () => {
    // Origin at (0,0): pushing left/up past 0 would expose negative space,
    // so the leading edge pins to 0 (signed zero is harmless for a delta).
    const result = restrictToWindowEdges(
      args({ transform: { x: -50, y: -30 } }),
    )
    expect(result.x === 0).toBe(true)
    expect(result.y === 0).toBe(true)
  })

  test('clamps the trailing edge to the right/bottom of the viewport', () => {
    // Overlay right=100/bottom=100 in a 1024x768 window: max shift is
    // 924 / 668 before an edge exits.
    expect(
      restrictToWindowEdges(args({ transform: { x: 2000, y: 2000 } })),
    ).toEqual({ x: 924, y: 668 })
  })

  test('clamps the trailing edge by the Overlay size, not the source (ADR-0020)', () => {
    // A 40-wide chip Overlay resting at the origin: its trailing edge is at
    // 40, so it may shift 984 before exiting a 1024-wide window — 60 further
    // than a 100-wide source footprint (924) would have allowed.
    expect(
      restrictToWindowEdges(
        args({
          transform: { x: 2000, y: 0 },
          overlayRect: rect(0, 0, 40, 40),
        }),
      ),
    ).toEqual({ x: 984, y: 0 })
  })

  test('respects the resting offset when clamping', () => {
    // Overlay already at left:200,right:300 — leftward room is 200.
    expect(
      restrictToWindowEdges(
        args({
          transform: { x: -500, y: 0 },
          overlayRect: rect(200, 200, 300, 300),
        }),
      ),
    ).toEqual({ x: -200, y: 0 })
  })
})

describe('restrictToVerticalAxis', () => {
  test('zeroes x, keeps y', () => {
    expect(
      restrictToVerticalAxis(args({ transform: { x: 80, y: 40 } })),
    ).toEqual({ x: 0, y: 40 })
  })
})

describe('restrictToHorizontalAxis', () => {
  test('zeroes y, keeps x', () => {
    expect(
      restrictToHorizontalAxis(args({ transform: { x: 80, y: 40 } })),
    ).toEqual({ x: 80, y: 0 })
  })
})

describe('snapToGrid', () => {
  test('rounds both axes to the nearest multiple of size', () => {
    const snap = snapToGrid(20)
    expect(snap(args({ transform: { x: 9, y: 31 } }))).toEqual({ x: 0, y: 40 })
    expect(snap(args({ transform: { x: 10, y: 50 } }))).toEqual({
      x: 20,
      y: 60,
    })
  })

  test('is a factory: different sizes snap to different grids', () => {
    expect(snapToGrid(50)(args({ transform: { x: 70, y: 70 } }))).toEqual({
      x: 50,
      y: 50,
    })
  })
})
