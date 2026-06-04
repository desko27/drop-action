import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDropAction } from '../main'
import type { DraggedItem, Measure, Rect } from '../main'

type Data = { label: string }

// Synthetic geometry injected through the measure boundary, so behaviour
// is exercised without real layout (happy-dom reports zero-sized rects).
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

// Item centre and Zone centre. Dragging from one to the other shifts the
// Overlay by (200, 0), landing it exactly over the Zone rect.
const ITEM_CENTER = { x: 50, y: 50 }
const ZONE_CENTER = { x: 250, y: 50 }

const press = (node: Element, at: { x: number; y: number }) =>
  fireEvent.pointerDown(node, { clientX: at.x, clientY: at.y, pointerId: 1 })
const move = (at: { x: number; y: number }) =>
  fireEvent.pointerMove(window, { clientX: at.x, clientY: at.y, pointerId: 1 })
const release = (at: { x: number; y: number }) =>
  fireEvent.pointerUp(window, { clientX: at.x, clientY: at.y, pointerId: 1 })

beforeEach(() => {
  // Run the engine's animation-frame throttle synchronously so a moved
  // pointer publishes within the fireEvent's act() flush.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Second test seam: drive the public API end-to-end with injected rects.
describe('createDropAction — public API behaviour', () => {
  test('exposes a namespace with at least Item, Zone, Active', () => {
    const DA = createDropAction<Data>('namespace')
    expect(typeof DA.Item).toBe('function')
    expect(typeof DA.Zone).toBe('function')
    expect(typeof DA.Active).toBe('function')
  })

  test('dropping an Item over a Zone calls onDrop with the dragged { id, data }', () => {
    const DA = createDropAction<Data>('drop', { measure })
    const onDrop = vi.fn()
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={onDrop}>
          slot
        </DA.Zone>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    expect(onDrop).toHaveBeenCalledTimes(1)
    const [dragged] = onDrop.mock.calls[0] as [DraggedItem<Data>]
    expect(dragged).toEqual({ id: 'card', data: { label: 'Card' } })
  })

  test("respond('accepted') runs the Item's onAccept; not responding does not", () => {
    const DA = createDropAction<Data>('accept', { measure })
    const onAccept = vi.fn()

    const dragOnto = (
      onDrop: (
        item: DraggedItem<Data>,
        respond: (s: 'accepted') => void,
      ) => void,
    ) => {
      const view = render(
        <>
          <DA.Item id="card" data={{ label: 'Card' }} onAccept={onAccept}>
            card
          </DA.Item>
          <DA.Zone id="slot" onDrop={onDrop}>
            slot
          </DA.Zone>
        </>,
      )
      press(screen.getByRole('button'), ITEM_CENTER)
      move(ZONE_CENTER)
      release(ZONE_CENTER)
      view.unmount()
    }

    dragOnto((_item, respond) => respond('accepted'))
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onAccept).toHaveBeenCalledWith({
      id: 'card',
      data: { label: 'Card' },
    })

    onAccept.mockClear()
    dragOnto(() => {
      /* Zone never responds → Reject */
    })
    expect(onAccept).not.toHaveBeenCalled()
  })

  test('the Active Overlay renders in a document.body portal and follows the pointer', () => {
    const DA = createDropAction<Data>('overlay', { measure })
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
        <DA.Active>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </DA.Active>
      </>,
    )

    // No Overlay before a drag begins.
    expect(screen.queryByTestId('overlay')).toBeNull()

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)

    const overlayContent = screen.getByTestId('overlay')
    const overlay = overlayContent.parentElement
    // Portalled straight to document.body, not nested in the React tree.
    expect(overlay?.parentElement).toBe(document.body)
    // Origin (0,0) shifted by the pointer delta (200,0).
    expect(overlay?.style.transform).toBe('translate3d(200px, 0px, 0)')

    // Releasing resolves the drop and tears the Overlay down.
    release(ZONE_CENTER)
    expect(screen.queryByTestId('overlay')).toBeNull()
  })

  test('a mouse move below the distance threshold does not start a drag', () => {
    const DA = createDropAction<Data>('below-threshold', { measure })
    const onDrop = vi.fn()
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={onDrop}>
          slot
        </DA.Zone>
        <DA.Active>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </DA.Active>
      </>,
    )

    // Press, nudge 2px (under the 4px mouse default), release: a click.
    press(screen.getByRole('button'), ITEM_CENTER)
    move({ x: ITEM_CENTER.x + 2, y: ITEM_CENTER.y })
    // No Active state was ever published while below the threshold.
    expect(screen.queryByTestId('overlay')).toBeNull()
    release({ x: ITEM_CENTER.x + 2, y: ITEM_CENTER.y })

    expect(onDrop).not.toHaveBeenCalled()
    expect(screen.queryByTestId('overlay')).toBeNull()
  })

  test('a mouse move past the distance threshold starts a drag', () => {
    const DA = createDropAction<Data>('above-threshold', { measure })
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
        <DA.Active>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </DA.Active>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    // 10px crosses the 4px default → the drag begins and the Overlay mounts.
    move({ x: ITEM_CENTER.x + 10, y: ITEM_CENTER.y })
    expect(screen.queryByTestId('overlay')).not.toBeNull()
  })

  test('touch activates on press-and-hold, not on a quick swipe', () => {
    vi.useFakeTimers()
    try {
      const DA = createDropAction<Data>('touch', {
        measure,
        activationConstraint: { touch: { delay: 250, tolerance: 5 } },
      })
      const onDrop = vi.fn()
      const view = render(
        <>
          <DA.Item id="card" data={{ label: 'Card' }}>
            card
          </DA.Item>
          <DA.Zone id="slot" onDrop={onDrop}>
            slot
          </DA.Zone>
          <DA.Active>
            {({ data }) => <div data-testid="overlay">{data.label}</div>}
          </DA.Active>
        </>,
      )

      // A quick swipe: move beyond tolerance before the delay → it scrolls,
      // never drags. No Overlay, no drop.
      fireEvent.pointerDown(screen.getByRole('button'), {
        clientX: ITEM_CENTER.x,
        clientY: ITEM_CENTER.y,
        pointerId: 1,
        pointerType: 'touch',
      })
      fireEvent.pointerMove(window, {
        clientX: ITEM_CENTER.x,
        clientY: ITEM_CENTER.y + 40,
        pointerId: 1,
        pointerType: 'touch',
      })
      act(() => vi.advanceTimersByTime(300))
      expect(screen.queryByTestId('overlay')).toBeNull()
      fireEvent.pointerUp(window, {
        clientX: ITEM_CENTER.x,
        clientY: ITEM_CENTER.y + 40,
        pointerId: 1,
        pointerType: 'touch',
      })
      expect(onDrop).not.toHaveBeenCalled()

      // A press-and-hold in place: held past the delay → the drag begins.
      fireEvent.pointerDown(screen.getByRole('button'), {
        clientX: ITEM_CENTER.x,
        clientY: ITEM_CENTER.y,
        pointerId: 2,
        pointerType: 'touch',
      })
      expect(screen.queryByTestId('overlay')).toBeNull()
      act(() => vi.advanceTimersByTime(250))
      expect(screen.queryByTestId('overlay')).not.toBeNull()

      view.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  test('an Item and a Zone sharing an id do not collide', () => {
    const DA = createDropAction<Data>('shared-id', { measure })
    const onDrop = vi.fn()
    render(
      <>
        <DA.Item id="x" data={{ label: 'X' }}>
          item-x
        </DA.Item>
        <DA.Zone id="x" onDrop={onDrop}>
          zone-x
        </DA.Zone>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    expect(onDrop).toHaveBeenCalledTimes(1)
    const [dragged] = onDrop.mock.calls[0] as [DraggedItem<Data>]
    expect(dragged.id).toBe('x')
  })
})
