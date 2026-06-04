import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDropAction, pointerWithin } from '../main'
import type { CollisionArgs, Measure, Rect } from '../main'

type Data = { label: string }

const rect = (left: number, top: number): Rect => ({
  top,
  left,
  right: left + 100,
  bottom: top + 100,
  width: 100,
  height: 100,
})

// One Item plus three Zones, each at a distinct horizontal band. The Item
// starts at the origin; dragging shifts the Overlay by the pointer delta so
// it can be steered onto any Zone.
const ITEM_RECT = rect(0, 0)
const ZONE_RECTS: Record<string, Rect> = {
  alpha: rect(200, 0),
  beta: rect(400, 0),
  gamma: rect(600, 0),
}

const measure: Measure = ({ id, type }) =>
  type === 'zone' ? ZONE_RECTS[id] : ITEM_RECT

const ITEM_CENTER = { x: 50, y: 50 }
// Center of each Zone rect (shift = zone.left + 50, vertical 50).
const centerOf = (id: keyof typeof ZONE_RECTS) => ({
  x: ZONE_RECTS[id].left + 50,
  y: 50,
})

const press = (node: Element, at: { x: number; y: number }) =>
  fireEvent.pointerDown(node, { clientX: at.x, clientY: at.y, pointerId: 1 })
const move = (at: { x: number; y: number }) =>
  fireEvent.pointerMove(window, { clientX: at.x, clientY: at.y, pointerId: 1 })
const release = (at: { x: number; y: number }) =>
  fireEvent.pointerUp(window, { clientX: at.x, clientY: at.y, pointerId: 1 })

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const renderBoard = (DA: ReturnType<typeof createDropAction<Data>>) => {
  const handlers = {
    alpha: vi.fn(),
    beta: vi.fn(),
    gamma: vi.fn(),
  }
  render(
    <>
      <DA.Item id="card" data={{ label: 'Card' }}>
        card
      </DA.Item>
      <DA.Zone id="alpha" onDrop={handlers.alpha}>
        alpha
      </DA.Zone>
      <DA.Zone id="beta" onDrop={handlers.beta}>
        beta
      </DA.Zone>
      <DA.Zone id="gamma" onDrop={handlers.gamma}>
        gamma
      </DA.Zone>
    </>,
  )
  return handlers
}

describe('createDropAction — multi-Zone collision routing', () => {
  test('with several Zones, the default detector routes the Drop to the one under the Overlay', () => {
    const DA = createDropAction<Data>('multi', { measure })
    const handlers = renderBoard(DA)

    // Steer the Overlay onto 'beta' (rect at left 400).
    press(screen.getByRole('button'), ITEM_CENTER)
    move(centerOf('beta'))
    release(centerOf('beta'))

    expect(handlers.beta).toHaveBeenCalledTimes(1)
    expect(handlers.alpha).not.toHaveBeenCalled()
    expect(handlers.gamma).not.toHaveBeenCalled()
  })

  test('a built-in detector (pointerWithin) can be selected and is honoured', () => {
    const DA = createDropAction<Data>('within', {
      measure,
      collisionDetection: pointerWithin,
    })
    const handlers = renderBoard(DA)

    press(screen.getByRole('button'), ITEM_CENTER)
    move(centerOf('gamma'))
    release(centerOf('gamma'))

    expect(handlers.gamma).toHaveBeenCalledTimes(1)
    expect(handlers.alpha).not.toHaveBeenCalled()
    expect(handlers.beta).not.toHaveBeenCalled()
  })

  test('a custom detector (args) => zoneId | null is honoured', () => {
    // A detector that always selects 'alpha', regardless of geometry.
    const detector = vi.fn((_args: CollisionArgs) => 'alpha')
    const DA = createDropAction<Data>('custom', {
      measure,
      collisionDetection: detector,
    })
    const handlers = renderBoard(DA)

    // Steer toward 'gamma' — the custom detector still routes to 'alpha'.
    press(screen.getByRole('button'), ITEM_CENTER)
    move(centerOf('gamma'))
    release(centerOf('gamma'))

    expect(detector).toHaveBeenCalled()
    expect(handlers.alpha).toHaveBeenCalledTimes(1)
    expect(handlers.gamma).not.toHaveBeenCalled()

    // The detector receives the live pointer, post-modifier overlay rect, and
    // the Zone-rect snapshot.
    const lastArgs = detector.mock.calls.at(-1)?.[0] as CollisionArgs
    expect(lastArgs.pointer).toEqual(centerOf('gamma'))
    expect(lastArgs.zones.map((z) => z.id).sort()).toEqual([
      'alpha',
      'beta',
      'gamma',
    ])
  })

  test('a detector only ever receives Zones from its own Drop Action', () => {
    const seen = new Set<string>()
    const detector = (args: CollisionArgs) => {
      for (const zone of args.zones) seen.add(zone.id)
      return null
    }

    // Two independent Drop Actions, each with its own Zones, rendered together.
    const A = createDropAction<Data>('action-a', {
      measure,
      collisionDetection: detector,
    })
    const otherMeasure: Measure = ({ type }) =>
      type === 'zone' ? rect(800, 0) : rect(0, 0)
    const B = createDropAction<Data>('action-b', { measure: otherMeasure })

    render(
      <>
        <A.Item id="card-a" data={{ label: 'A' }}>
          card-a
        </A.Item>
        <A.Zone id="alpha" onDrop={() => {}}>
          alpha
        </A.Zone>
        <A.Zone id="beta" onDrop={() => {}}>
          beta
        </A.Zone>
        <B.Item id="card-b" data={{ label: 'B' }}>
          card-b
        </B.Item>
        <B.Zone id="zeta" onDrop={() => {}}>
          zeta
        </B.Zone>
      </>,
    )

    // Drag the Item belonging to Drop Action A.
    const [handleA] = screen.getAllByRole('button')
    press(handleA, ITEM_CENTER)
    move(centerOf('beta'))
    release(centerOf('beta'))

    // The detector saw only A's Zones — never B's 'zeta'.
    expect(seen).toEqual(new Set(['alpha', 'beta']))
    expect(seen.has('zeta')).toBe(false)
  })
})
