import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDropAction } from '../main'
import type { DraggedItem, Measure, Rect, Respond } from '../main'
import { createSnapBack } from '../snap-back'

type Data = { label: string }

// Same synthetic geometry as the core behaviour suite: dragging from the
// Item centre to the Zone centre shifts the Overlay by (200, 0).
const ITEM_RECT: Rect = {
  top: 0,
  left: 0,
  right: 100,
  bottom: 100,
  width: 100,
  height: 100,
}
const ZONE_RECT: Rect = {
  top: 0,
  left: 200,
  right: 300,
  bottom: 100,
  width: 100,
  height: 100,
}
const measure: Measure = ({ type }) => (type === 'zone' ? ZONE_RECT : ITEM_RECT)

const ITEM_CENTER = { x: 50, y: 50 }
const ZONE_CENTER = { x: 250, y: 50 }

const press = (node: Element, at: { x: number; y: number }) =>
  fireEvent.pointerDown(node, { clientX: at.x, clientY: at.y, pointerId: 1 })
const move = (at: { x: number; y: number }) =>
  fireEvent.pointerMove(window, { clientX: at.x, clientY: at.y, pointerId: 1 })
const release = (at: { x: number; y: number }) =>
  fireEvent.pointerUp(window, { clientX: at.x, clientY: at.y, pointerId: 1 })
const pressEscape = () => fireEvent.keyDown(window, { key: 'Escape' })
const cancelPointer = () => fireEvent.pointerCancel(window, { pointerId: 1 })

// A point clear of the Zone (200..300 on x): dropping here is a No-drop.
const EMPTY_POINT = { x: 50, y: 600 }

const flush = () => act(async () => {})

beforeEach(() => {
  // Run the engine's rAF throttle AND snap-back's one-frame phase flip
  // synchronously, so a moved pointer and the bounce's start->home step
  // both land inside the surrounding act() flush.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// The snap-back overlay element rendered by <SnapBack> (the portal child).
const overlay = () => screen.queryByTestId('overlay')?.parentElement ?? null

describe('drop-action/snap-back — Reject bounce', () => {
  test('a Reject animates the Overlay back to the origin rect; an Accept does not', async () => {
    const DA = createDropAction<Data>('snap-reject', { measure })
    // The reject Zone awaits, then returns without responding -> Reject. The
    // await lets the Dropping phase render, which is what snap-back keys off.
    let resolveReject: (() => void) | undefined
    const rejectDrop = async () => {
      await new Promise<void>((r) => {
        resolveReject = r
      })
      // No respond() -> Reject.
    }
    const { SnapBack } = createSnapBack({
      useActive: DA.useActive,
      useResolution: DA.useResolution,
    })

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={rejectDrop}>
          slot
        </DA.Zone>
        <SnapBack>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </SnapBack>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)

    // Dragging: the Overlay follows the pointer with no transition.
    expect(overlay()?.style.transform).toBe('translate3d(200px, 0px, 0)')
    expect(overlay()?.style.transition).toBe('')

    // Release over the Zone -> Dropping phase renders, then the awaited
    // handler resolves with no accept -> Reject, which fires the bounce.
    release(ZONE_CENTER)
    resolveReject?.()
    await flush()

    // The ghost Overlay is still mounted and now eases back to the origin:
    // transform returns to (0,0) under a transform transition.
    const ghost = overlay()
    expect(ghost).not.toBeNull()
    expect(ghost?.style.transform).toBe('translate3d(0px, 0px, 0)')
    expect(ghost?.style.transition).toMatch(/^transform \d+ms /)
  })

  test('a synchronous Accept does not snap back (no bounce, Overlay gone)', async () => {
    const DA = createDropAction<Data>('snap-accept', { measure })
    const onAccept = vi.fn()
    const { SnapBack } = createSnapBack({
      useActive: DA.useActive,
      useResolution: DA.useResolution,
    })

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }} onAccept={onAccept}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={(_item, respond) => respond('accepted')}>
          slot
        </DA.Zone>
        <SnapBack>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </SnapBack>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    expect(overlay()).not.toBeNull()

    // Synchronous accept: the drag resolves within the release without a
    // rendered Dropping phase, so there is nothing to bounce.
    release(ZONE_CENTER)
    await flush()

    expect(onAccept).toHaveBeenCalledTimes(1)
    // No ghost Overlay lingers and nothing snapped back.
    expect(overlay()).toBeNull()
  })

  test('useSnapBack exposes snapping=true on Reject and false on Accept', async () => {
    const DA = createDropAction<Data>('snap-state', { measure })
    let resolveReject: (() => void) | undefined
    const rejectDrop = async () => {
      await new Promise<void>((r) => {
        resolveReject = r
      })
    }
    const { useSnapBack } = createSnapBack({
      useActive: DA.useActive,
      useResolution: DA.useResolution,
    })

    function Probe() {
      const { snapping, item } = useSnapBack()
      const dragged = item as DraggedItem<Data> | null
      return (
        <div data-testid="state">
          {snapping ? 'snapping' : 'idle'}:{dragged ? dragged.id : 'none'}
        </div>
      )
    }

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={rejectDrop}>
          slot
        </DA.Zone>
        <Probe />
      </>,
    )

    expect(screen.getByTestId('state')).toHaveTextContent('idle:none')

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    // Dragging: an item is present but no bounce is running.
    expect(screen.getByTestId('state')).toHaveTextContent('idle:card')

    release(ZONE_CENTER)
    resolveReject?.()
    await flush()

    // Reject: the bounce is active, the captured Item still readable.
    expect(screen.getByTestId('state')).toHaveTextContent('snapping:card')
  })
})

describe('drop-action/snap-back — every Return bounces', () => {
  // The bounce's end state: the ghost is mounted and eased back to origin.
  const expectBouncedHome = () => {
    const ghost = overlay()
    expect(ghost).not.toBeNull()
    expect(ghost?.style.transform).toBe('translate3d(0px, 0px, 0)')
    expect(ghost?.style.transition).toMatch(/^transform \d+ms /)
  }

  test('an async Accept does not snap back — outcome is read, not inferred', async () => {
    const DA = createDropAction<Data>('snap-accept-async', { measure })
    const onAccept = vi.fn()
    // The Zone awaits, then accepts. A Dropping phase renders during the gap
    // (which the old "saw a 'dropping' frame" inference bounced on), but the
    // outcome is 'accepted', so there is nothing to return.
    let resolveAccept: (() => void) | undefined
    const acceptDrop = async (_item: DraggedItem<Data>, respond: Respond) => {
      await new Promise<void>((r) => {
        resolveAccept = r
      })
      respond('accepted')
    }
    const { SnapBack } = createSnapBack({
      useActive: DA.useActive,
      useResolution: DA.useResolution,
    })

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }} onAccept={onAccept}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={acceptDrop}>
          slot
        </DA.Zone>
        <SnapBack>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </SnapBack>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)
    resolveAccept?.()
    await flush()

    expect(onAccept).toHaveBeenCalledTimes(1)
    // No ghost lingers: an Accept is the only non-Return outcome.
    expect(overlay()).toBeNull()
  })

  test('releasing over no Zone (a No-drop) snaps back', async () => {
    const DA = createDropAction<Data>('snap-no-drop', { measure })
    const { SnapBack } = createSnapBack({
      useActive: DA.useActive,
      useResolution: DA.useResolution,
    })

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
        <SnapBack>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </SnapBack>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    // Activate the drag, then release clear of the Zone: no Drop, a Return.
    move(EMPTY_POINT)
    release(EMPTY_POINT)
    await flush()

    expectBouncedHome()
  })

  test('cancelling with Escape snaps back from wherever the Overlay is', async () => {
    const DA = createDropAction<Data>('snap-cancel-esc', { measure })
    const { SnapBack } = createSnapBack({
      useActive: DA.useActive,
      useResolution: DA.useResolution,
    })

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
        <SnapBack>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </SnapBack>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    // Mid-drag abort: no Drop, a Return that eases home.
    pressEscape()
    await flush()

    expectBouncedHome()
  })

  test('pointercancel snaps back likewise', async () => {
    const DA = createDropAction<Data>('snap-cancel-pointer', { measure })
    const { SnapBack } = createSnapBack({
      useActive: DA.useActive,
      useResolution: DA.useResolution,
    })

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
        <SnapBack>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </SnapBack>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    cancelPointer()
    await flush()

    expectBouncedHome()
  })

  test('useSnapBack exposes the Return outcome so consumers can vary treatment', async () => {
    const DA = createDropAction<Data>('snap-outcome', { measure })
    const { useSnapBack } = createSnapBack({
      useActive: DA.useActive,
      useResolution: DA.useResolution,
    })

    function Probe() {
      const { outcome } = useSnapBack()
      return <div data-testid="outcome">{outcome ?? 'none'}</div>
    }

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
        <Probe />
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    pressEscape()
    await flush()

    // The hook surfaces which Return it is animating — here, a Cancel.
    expect(screen.getByTestId('outcome')).toHaveTextContent('cancelled')
  })
})
