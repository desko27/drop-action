import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  createDropAction,
  restrictToVerticalAxis,
  restrictToWindowEdges,
  snapToGrid,
} from '../main'
import type { DraggedItem, Measure, Rect, ZoneDropHandler } from '../main'

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
const cancel = () => fireEvent.pointerCancel(window, { pointerId: 1 })
const pressEscape = () => fireEvent.keyDown(window, { key: 'Escape' })

// Flush pending microtasks (Promise callbacks) inside act() so the store
// updates the async drop resolution schedules are observed by React.
const flush = () => act(async () => {})

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
    const DA = createDropAction<Data>()
    expect(typeof DA.Item).toBe('function')
    expect(typeof DA.Zone).toBe('function')
    expect(typeof DA.Active).toBe('function')
  })

  test('dropping an Item over a Zone calls onDrop with the dragged { id, data }', () => {
    const DA = createDropAction<Data>({ measure })
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

  test('onDrop gets the drag-start data, not data mutated mid-drag (ADR-0027)', () => {
    const DA = createDropAction<Data>({ measure })
    const onDrop = vi.fn()
    const view = (label: string) => (
      <>
        <DA.Item id="card" data={{ label }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={onDrop}>
          slot
        </DA.Zone>
      </>
    )
    const { rerender } = render(view('before'))

    press(screen.getByRole('button'), ITEM_CENTER)
    // Activate the drag — the snapshot is frozen now (ADR-0027) — then mutate
    // the Item's data before the Drop lands.
    move({ x: 120, y: 50 })
    rerender(view('after'))
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    const [dragged] = onDrop.mock.calls[0] as [DraggedItem<Data>]
    expect(dragged.data).toEqual({ label: 'before' })
  })

  test("accept() runs the Item's onAccept; not responding does not", () => {
    const DA = createDropAction<Data>({ measure })
    const onAccept = vi.fn()

    const dragOnto = (onDrop: ZoneDropHandler<Data>) => {
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

    dragOnto((_item, { accept }) => accept())
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onAccept).toHaveBeenCalledWith(
      { id: 'card', data: { label: 'Card' } },
      undefined,
    )

    onAccept.mockClear()
    dragOnto(() => {
      /* Zone never responds → Reject */
    })
    expect(onAccept).not.toHaveBeenCalled()
  })

  test("reject() runs the Item's onReject; a no-op Reject is inert", () => {
    const DA = createDropAction<Data>({ measure })
    const onReject = vi.fn()

    const dragOnto = (onDrop: ZoneDropHandler<Data>) => {
      const view = render(
        <>
          <DA.Item id="card" data={{ label: 'Card' }} onReject={onReject}>
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

    // An explicit reject() — a guard clause — runs onReject (ADR-0014).
    dragOnto((_item, { reject }) => reject())
    expect(onReject).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledWith(
      { id: 'card', data: { label: 'Card' } },
      undefined,
    )

    // Never responding is still a Reject, but inert: no onReject (ADR-0003).
    onReject.mockClear()
    dragOnto(() => {})
    expect(onReject).not.toHaveBeenCalled()
  })

  test('accept(payload) / reject(payload) carry the payload to onAccept / onReject', () => {
    type Slot = { slot: number }
    const DA = createDropAction<Data, Slot, string>({ measure })
    const onAccept = vi.fn()
    const onReject = vi.fn()

    const dragOnto = (onDrop: ZoneDropHandler<Data, Slot, string>) => {
      const view = render(
        <>
          <DA.Item
            id="card"
            data={{ label: 'Card' }}
            onAccept={onAccept}
            onReject={onReject}
          >
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

    dragOnto((_item, { accept }) => accept({ slot: 3 }))
    expect(onAccept).toHaveBeenCalledWith(
      { id: 'card', data: { label: 'Card' } },
      { slot: 3 },
    )

    dragOnto((_item, { reject }) => reject('not allowed'))
    expect(onReject).toHaveBeenCalledWith(
      { id: 'card', data: { label: 'Card' } },
      'not allowed',
    )
  })

  test('the first verdict wins: a reject() after accept() is ignored', () => {
    const DA = createDropAction<Data>({ measure })
    const onAccept = vi.fn()
    const onReject = vi.fn()
    render(
      <>
        <DA.Item
          id="card"
          data={{ label: 'Card' }}
          onAccept={onAccept}
          onReject={onReject}
        >
          card
        </DA.Item>
        <DA.Zone
          id="slot"
          onDrop={(_item, { accept, reject }) => {
            accept()
            reject()
          }}
        >
          slot
        </DA.Zone>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onReject).not.toHaveBeenCalled()
  })

  test('the Active Overlay renders in a document.body portal and follows the pointer', async () => {
    const DA = createDropAction<Data>({ measure })
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

    // Releasing over a Zone enters the Dropping phase; the Overlay persists
    // through the async gap. This Zone never responds → Reject, which only
    // resolves on the next microtask, tearing the Overlay down.
    release(ZONE_CENTER)
    expect(screen.queryByTestId('overlay')).not.toBeNull()
    await flush()
    expect(screen.queryByTestId('overlay')).toBeNull()
  })

  test('a modifier drives the published transform AND collision (ADR-0007)', () => {
    // restrictToVerticalAxis zeroes x. The Zone sits to the right (left:200),
    // so an x-zeroed Overlay can never reach it — Over must be null and the
    // drop must not fire, even though the pointer travels onto the Zone.
    const DA = createDropAction<Data>({
      measure,
      modifiers: [restrictToVerticalAxis],
    })
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

    press(screen.getByRole('button'), ITEM_CENTER)
    move({ x: ZONE_CENTER.x, y: 80 })

    // The published transform is post-modifier: x clamped to 0, y kept.
    const overlay = screen.getByTestId('overlay').parentElement
    expect(overlay?.style.transform).toBe('translate3d(0px, 30px, 0)')

    release({ x: ZONE_CENTER.x, y: 80 })
    // Over never matched the Zone, so no drop resolved.
    expect(onDrop).not.toHaveBeenCalled()
  })

  test('snapToGrid rounds the published transform to the grid', () => {
    const DA = createDropAction<Data>({
      measure,
      modifiers: [snapToGrid(50)],
    })
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
    // Pointer delta (70, 30) snaps to the nearest multiples of 50 → (50, 50).
    move({ x: ITEM_CENTER.x + 70, y: ITEM_CENTER.y + 30 })

    const overlay = screen.getByTestId('overlay').parentElement
    expect(overlay?.style.transform).toBe('translate3d(50px, 50px, 0)')
  })

  test('restrictToWindowEdges clamps against the measured Overlay size, not the source (ADR-0020)', () => {
    // A compact 40x40 chip Overlay over a 100x100 source. The edge clamp must
    // follow the *visible* chip: its trailing edge is 60px shorter, so it may
    // travel 60px further right than the source footprint would have allowed.
    const CHIP_RECT: Rect = {
      top: 0,
      left: 0,
      right: 40,
      bottom: 40,
      width: 40,
      height: 40,
    }
    const measureChip: Measure = ({ type }) =>
      type === 'zone' ? ZONE_RECT : type === 'overlay' ? CHIP_RECT : ITEM_RECT
    // `grabAnchor: 'preserve'` keeps the chip anchored at the source top-left
    // (ADR-0021), so this test isolates the ADR-0020 edge clamp from the new
    // 'proportional' default (which would centre the chip on the grab point).
    const DA = createDropAction<Data>({
      measure: measureChip,
      modifiers: [restrictToWindowEdges],
      grabAnchor: 'preserve',
    })
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Active>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </DA.Active>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    // First move activates the drag and mounts the Active Overlay so its node
    // can be measured; the second move (with the Overlay now measured) shoves
    // it far past the right edge to trigger the clamp.
    move({ x: ITEM_CENTER.x + 20, y: ITEM_CENTER.y })
    move({ x: window.innerWidth + 1000, y: ITEM_CENTER.y })

    // Clamped to windowWidth - chipWidth(40), not windowWidth - sourceWidth(100).
    const overlay = screen.getByTestId('overlay').parentElement
    expect(overlay?.style.transform).toBe(
      `translate3d(${window.innerWidth - 40}px, 0px, 0)`,
    )
  })

  test('useActive reflects the Active Item (id, data, status, originRect) during a drag and is null otherwise', async () => {
    const DA = createDropAction<Data>({ measure })
    function Probe() {
      const active = DA.useActive()
      if (!active) return <div data-testid="active">none</div>
      return (
        <div data-testid="active">
          {active.id}:{active.data.label}:{active.status}:
          {active.originRect.top},{active.originRect.left}
        </div>
      )
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

    expect(screen.getByTestId('active')).toHaveTextContent('none')

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)

    // id, data, status and the source Item's origin rect are all readable.
    expect(screen.getByTestId('active')).toHaveTextContent(
      'card:Card:dragging:0,0',
    )

    // Releasing over a Zone enters the Dropping phase; the Reject resolves on
    // the next microtask, tearing the Active state back down to idle.
    release(ZONE_CENTER)
    await flush()
    expect(screen.getByTestId('active')).toHaveTextContent('none')
  })

  test('useOver is truthy only while the Active Item is Over that Zone, and at most one Zone is Over', async () => {
    const DA = createDropAction<Data>({ measure })
    function Probe({ zoneId }: { zoneId: string }) {
      const over = DA.useOver(zoneId)
      return <div data-testid={`over-${zoneId}`}>{over ? over.id : 'none'}</div>
    }
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        {/* The Overlay is mandatory (ADR-0032): collision is Overlay-sized and
            the initial Over resolves on the Overlay's registration. */}
        <DA.Active>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </DA.Active>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
        <DA.Zone id="other" onDrop={() => {}}>
          other
        </DA.Zone>
        <Probe zoneId="slot" />
        <Probe zoneId="other" />
      </>,
    )

    // Idle: no Zone is Over.
    expect(screen.getByTestId('over-slot')).toHaveTextContent('none')
    expect(screen.getByTestId('over-other')).toHaveTextContent('none')

    press(screen.getByRole('button'), ITEM_CENTER)
    // The Overlay starts over the Item's origin — not over any Zone yet.
    expect(screen.getByTestId('over-slot')).toHaveTextContent('none')
    expect(screen.getByTestId('over-other')).toHaveTextContent('none')

    // Both Zones share the synthetic ZONE_RECT here; the collision detector
    // returns a single winner, so exactly one Zone is ever Over.
    move(ZONE_CENTER)
    const slotOver = screen.getByTestId('over-slot').textContent === 'card'
    const otherOver = screen.getByTestId('over-other').textContent === 'card'
    expect(slotOver !== otherOver).toBe(true)

    // Releasing over a Zone enters the Dropping phase; once the Reject
    // resolves on the next microtask no Zone is Over again.
    release(ZONE_CENTER)
    await flush()
    expect(screen.getByTestId('over-slot')).toHaveTextContent('none')
    expect(screen.getByTestId('over-other')).toHaveTextContent('none')
  })

  test('the initial Over is resolved from the Overlay, not the source footprint (ADR-0032)', () => {
    // A 30x30 chip Overlay over a 100x100 source, anchored at the source
    // top-left ('preserve'). The Zone sits at x:[50,150] — the *source*
    // footprint overlaps it at drag start, but the *chip* does not. The initial
    // Over must follow the chip (null), never flash the source's Zone.
    const CHIP_RECT: Rect = {
      top: 0,
      left: 0,
      right: 30,
      bottom: 30,
      width: 30,
      height: 30,
    }
    const ZONE_AT_50: Rect = {
      top: 0,
      left: 50,
      right: 150,
      bottom: 100,
      width: 100,
      height: 100,
    }
    const measureChip: Measure = ({ type }) =>
      type === 'zone' ? ZONE_AT_50 : type === 'overlay' ? CHIP_RECT : ITEM_RECT
    const DA = createDropAction<Data>({
      measure: measureChip,
      grabAnchor: 'preserve',
    })
    function Probe() {
      const over = DA.useOver('slot')
      return <div data-testid="over-slot">{over ? over.id : 'none'}</div>
    }
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Active>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </DA.Active>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
        <Probe />
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    // Cross the 8px mouse threshold by 2px: the chip sits at x:[10,40] — short
    // of the Zone at x:50 — while the 100-wide source footprint would reach it.
    move({ x: ITEM_CENTER.x + 10, y: ITEM_CENTER.y })
    expect(screen.getByTestId('over-slot')).toHaveTextContent('none')

    // Shoving the chip onto the Zone resolves Over normally — it was never stuck.
    move({ x: ITEM_CENTER.x + 50, y: ITEM_CENTER.y })
    expect(screen.getByTestId('over-slot')).toHaveTextContent('card')
  })

  test('useItem(...).isDragging is true for the dragged Item and false otherwise', async () => {
    const DA = createDropAction<Data>({ measure })
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }} className="card">
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
      </>,
    )

    const item = screen.getByRole('button')
    // The component surfaces isDragging as a data attribute.
    expect(item).not.toHaveAttribute('data-dragging')

    press(item, ITEM_CENTER)
    move(ZONE_CENTER)
    expect(item).toHaveAttribute('data-dragging')

    // Releasing over a Zone enters the Dropping phase; the Item is no longer
    // dragging once the Reject resolves on the next microtask.
    release(ZONE_CENTER)
    await flush()
    expect(item).not.toHaveAttribute('data-dragging')
  })

  test('Active redirects the portal to a custom container', () => {
    const DA = createDropAction<Data>({ measure })
    const container = document.createElement('div')
    container.id = 'overlay-host'
    document.body.appendChild(container)

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
        <DA.Active container={container}>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </DA.Active>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)

    const overlay = screen.getByTestId('overlay').parentElement
    // Portalled into the custom container, not directly into document.body.
    expect(overlay?.parentElement).toBe(container)

    release(ZONE_CENTER)
    container.remove()
  })

  test("a Drop fires only the Over Zone's onDrop, not another Zone's", () => {
    // Zone 'b' sits where the Item lands (ZONE_RECT); 'a' sits far away.
    const isolationMeasure: Measure = ({ id, type }) => {
      if (type === 'item') return ITEM_RECT
      if (id === 'b') return ZONE_RECT
      return {
        top: 500,
        left: 500,
        right: 600,
        bottom: 600,
        width: 100,
        height: 100,
      }
    }
    const DA = createDropAction<Data>({
      measure: isolationMeasure,
    })
    const onA = vi.fn()
    const onB = vi.fn()

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="a" onDrop={onA}>
          zone a
        </DA.Zone>
        <DA.Zone id="b" onDrop={onB}>
          zone b
        </DA.Zone>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    expect(onB).toHaveBeenCalledTimes(1)
    expect(onA).not.toHaveBeenCalled()
  })

  test('a mouse move below the distance threshold does not start a drag', () => {
    const DA = createDropAction<Data>({ measure })
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

    // Press, nudge 2px (under the 8px mouse default), release: a click.
    press(screen.getByRole('button'), ITEM_CENTER)
    move({ x: ITEM_CENTER.x + 2, y: ITEM_CENTER.y })
    // No Active state was ever published while below the threshold.
    expect(screen.queryByTestId('overlay')).toBeNull()
    release({ x: ITEM_CENTER.x + 2, y: ITEM_CENTER.y })

    expect(onDrop).not.toHaveBeenCalled()
    expect(screen.queryByTestId('overlay')).toBeNull()
  })

  test('a mouse move past the distance threshold starts a drag', () => {
    const DA = createDropAction<Data>({ measure })
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
    // 10px crosses the 8px default → the drag begins and the Overlay mounts.
    move({ x: ITEM_CENTER.x + 10, y: ITEM_CENTER.y })
    expect(screen.queryByTestId('overlay')).not.toBeNull()
  })

  test('touch activates on press-and-hold, not on a quick swipe', () => {
    vi.useFakeTimers()
    try {
      const DA = createDropAction<Data>({
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
    const DA = createDropAction<Data>({ measure })
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

// Async resolution, the Dropping status, and cancellation (ADR-0003,
// ADR-0004). A Drop may await before deciding; only accept() runs onAccept;
// Esc and pointercancel abort with no Drop at all.
describe('createDropAction — async resolution, status, cancellation', () => {
  test('a Zone that awaits before deciding accepts after the delay', async () => {
    const action = createDropAction<Data>({ measure })
    const onAccept = vi.fn()
    let resolve: (() => void) | undefined
    const onDrop: ZoneDropHandler<Data> = async (_item, { accept }) => {
      await new Promise<void>((r) => {
        resolve = r
      })
      accept()
    }

    render(
      <>
        <action.Item id="card" data={{ label: 'Card' }} onAccept={onAccept}>
          card
        </action.Item>
        <action.Zone id="slot" onDrop={onDrop}>
          slot
        </action.Zone>
        <action.Active>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </action.Active>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    // Dropping phase: the Overlay persists while the handler is in flight,
    // and onAccept has not run yet.
    expect(screen.queryByTestId('overlay')).not.toBeNull()
    expect(onAccept).not.toHaveBeenCalled()

    resolve?.()
    await flush()

    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onAccept).toHaveBeenCalledWith(
      { id: 'card', data: { label: 'Card' } },
      undefined,
    )
    expect(screen.queryByTestId('overlay')).toBeNull()
  })

  test('a Zone that awaits then never responds rejects after the delay', async () => {
    const action = createDropAction<Data>({ measure })
    const onAccept = vi.fn()
    let resolve: (() => void) | undefined
    const onDrop = async () => {
      await new Promise<void>((r) => {
        resolve = r
      })
      // Returns without responding → Reject.
    }

    render(
      <>
        <action.Item id="card" data={{ label: 'Card' }} onAccept={onAccept}>
          card
        </action.Item>
        <action.Zone id="slot" onDrop={onDrop}>
          slot
        </action.Zone>
        <action.Active>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </action.Active>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    expect(screen.queryByTestId('overlay')).not.toBeNull()

    resolve?.()
    await flush()

    expect(onAccept).not.toHaveBeenCalled()
    expect(screen.queryByTestId('overlay')).toBeNull()
  })

  test('a synchronous accept() accepts within the release', async () => {
    const action = createDropAction<Data>({ measure })
    const onAccept = vi.fn()

    render(
      <>
        <action.Item id="card" data={{ label: 'Card' }} onAccept={onAccept}>
          card
        </action.Item>
        <action.Zone id="slot" onDrop={(_item, { accept }) => accept()}>
          slot
        </action.Zone>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    // Synchronous accept resolves immediately — no microtask flush needed.
    expect(onAccept).toHaveBeenCalledTimes(1)
    await flush()
    expect(onAccept).toHaveBeenCalledTimes(1)
  })

  test('Escape cancels an in-flight drag: no Drop, no onAccept, store resets', async () => {
    const action = createDropAction<Data>({ measure })
    const onDrop = vi.fn()
    const onAccept = vi.fn()

    render(
      <>
        <action.Item id="card" data={{ label: 'Card' }} onAccept={onAccept}>
          card
        </action.Item>
        <action.Zone id="slot" onDrop={onDrop}>
          slot
        </action.Zone>
        <action.Active>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </action.Active>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    expect(screen.queryByTestId('overlay')).not.toBeNull()

    pressEscape()
    await flush()

    expect(onDrop).not.toHaveBeenCalled()
    expect(onAccept).not.toHaveBeenCalled()
    expect(screen.queryByTestId('overlay')).toBeNull()
  })

  test('pointercancel cancels an in-flight drag likewise', async () => {
    const action = createDropAction<Data>({ measure })
    const onDrop = vi.fn()
    const onAccept = vi.fn()

    render(
      <>
        <action.Item id="card" data={{ label: 'Card' }} onAccept={onAccept}>
          card
        </action.Item>
        <action.Zone id="slot" onDrop={onDrop}>
          slot
        </action.Zone>
        <action.Active>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </action.Active>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    expect(screen.queryByTestId('overlay')).not.toBeNull()

    cancel()
    await flush()

    expect(onDrop).not.toHaveBeenCalled()
    expect(onAccept).not.toHaveBeenCalled()
    expect(screen.queryByTestId('overlay')).toBeNull()
  })
})

// The four findings fixed in this prerelease (ADR-0016, ADR-0017, ADR-0018).
describe('createDropAction — Activation guard (ADR-0016)', () => {
  test('a press on an interactive child does not start a drag; the rest of the Item does', () => {
    const DA = createDropAction<Data>({ measure })
    const onDrop = vi.fn()
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          <input data-testid="check" type="checkbox" />
          <span data-testid="body">card</span>
        </DA.Item>
        <DA.Zone id="slot" onDrop={onDrop}>
          slot
        </DA.Zone>
      </>,
    )

    // Pressing the checkbox inside the whole-Item handle never hijacks a drag.
    press(screen.getByTestId('check'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)
    expect(onDrop).not.toHaveBeenCalled()

    // Pressing elsewhere in the Item starts a drag as usual.
    press(screen.getByTestId('body'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)
    expect(onDrop).toHaveBeenCalledTimes(1)
  })

  test('a custom shouldStart replaces the default veto', () => {
    const DA = createDropAction<Data>({ measure, shouldStart: () => true })
    const onDrop = vi.fn()
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          <input data-testid="check" type="checkbox" />
        </DA.Item>
        <DA.Zone id="slot" onDrop={onDrop}>
          slot
        </DA.Zone>
      </>,
    )

    // `shouldStart: () => true` lets a drag begin even on the checkbox.
    press(screen.getByTestId('check'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)
    expect(onDrop).toHaveBeenCalledTimes(1)
  })
})

describe('createDropAction — collision rects (ADR-0017)', () => {
  test('collision is sized from the measured Overlay, not the source Item', () => {
    // A tall 100×100 source, but a tiny 10×10 Overlay. The Zone sits just past
    // the source's right edge: the big source rect would overlap it, the small
    // Overlay does not — so the Drop must not fire.
    const overlayMeasure: Measure = ({ type }) => {
      if (type === 'overlay')
        return { top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10 }
      if (type === 'zone')
        return {
          top: 0,
          left: 95,
          right: 195,
          bottom: 100,
          width: 100,
          height: 100,
        }
      return ITEM_RECT
    }
    const DA = createDropAction<Data>({ measure: overlayMeasure })
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

    // Nudge 5px: the source (0..100) would still overlap the Zone (95..195),
    // but the 10px Overlay (anchored at 5..15) does not.
    press(screen.getByRole('button'), ITEM_CENTER)
    move({ x: ITEM_CENTER.x + 5, y: ITEM_CENTER.y })
    release({ x: ITEM_CENTER.x + 5, y: ITEM_CENTER.y })
    expect(onDrop).not.toHaveBeenCalled()
  })

  test('Zone rects are re-measured on scroll, so Over tracks a scrolled Zone', () => {
    // The Zone starts far from the Overlay, then "scrolls" under it. A scroll
    // event must re-measure and update Over with no pointer movement.
    let zoneRect: Rect = {
      top: 0,
      left: 1000,
      right: 1100,
      bottom: 100,
      width: 100,
      height: 100,
    }
    const dynamicMeasure: Measure = ({ type }) =>
      type === 'zone' ? zoneRect : ITEM_RECT
    const DA = createDropAction<Data>({ measure: dynamicMeasure })
    function Probe() {
      const over = DA.useOver('slot')
      return <div data-testid="over">{over ? 'over' : 'none'}</div>
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
    // The Overlay sits at (200,0); the Zone is far away at left:1000.
    expect(screen.getByTestId('over')).toHaveTextContent('none')

    // The Zone scrolls under the Overlay (its rect now starts at left:200).
    zoneRect = {
      top: 0,
      left: 200,
      right: 300,
      bottom: 100,
      width: 100,
      height: 100,
    }
    fireEvent.scroll(window)
    expect(screen.getByTestId('over')).toHaveTextContent('over')
  })
})

describe('createDropAction — selective reads (ADR-0018)', () => {
  test('an Over transition re-renders only the Zones whose membership flips', () => {
    const ZONES: Record<string, Rect> = {
      a: {
        top: 0,
        left: 200,
        right: 300,
        bottom: 100,
        width: 100,
        height: 100,
      },
      b: {
        top: 0,
        left: 400,
        right: 500,
        bottom: 100,
        width: 100,
        height: 100,
      },
      c: {
        top: 0,
        left: 600,
        right: 700,
        bottom: 100,
        width: 100,
        height: 100,
      },
    }
    const routingMeasure: Measure = ({ id, type }) =>
      type === 'zone' ? ZONES[id] : ITEM_RECT
    const DA = createDropAction<Data>({ measure: routingMeasure })

    const renders = { a: 0, b: 0, c: 0 }
    function Probe({ id }: { id: 'a' | 'b' | 'c' }) {
      DA.useOver(id)
      renders[id]++
      return null
    }
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        {/* The Overlay is mandatory (ADR-0032): the initial Over resolves on its
            registration, so 'a' is Over right after the activating move. */}
        <DA.Active>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </DA.Active>
        <DA.Zone id="a" onDrop={() => {}}>
          a
        </DA.Zone>
        <DA.Zone id="b" onDrop={() => {}}>
          b
        </DA.Zone>
        <DA.Zone id="c" onDrop={() => {}}>
          c
        </DA.Zone>
        <Probe id="a" />
        <Probe id="b" />
        <Probe id="c" />
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move({ x: 250, y: 50 }) // Overlay over Zone 'a'
    const cBefore = renders.c
    const aBefore = renders.a

    move({ x: 450, y: 50 }) // Over flips a -> b
    // 'c' was never Over either side of the flip, so it must not re-render.
    expect(renders.c).toBe(cBefore)
    // 'a' lost Over, so it did re-render.
    expect(renders.a).toBeGreaterThan(aBefore)
  })
})

describe('createDropAction — grabbing cursor (ADR-0019)', () => {
  const grabbingStyle = () =>
    document.getElementById('drop-action-grabbing-cursor')

  // Isolate from any earlier test that activated a drag without releasing.
  beforeEach(() => grabbingStyle()?.remove())

  test('a live drag injects a global grabbing cursor that clears on release', () => {
    const DA = createDropAction<Data>({ measure })
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
      </>,
    )

    expect(grabbingStyle()).toBeNull()
    press(screen.getByRole('button'), ITEM_CENTER)
    // Pressed but not yet activated (still pending): no global cursor.
    expect(grabbingStyle()).toBeNull()

    move(ZONE_CENTER) // crosses the threshold → the drag activates
    expect(grabbingStyle()?.textContent).toContain('grabbing')

    release(ZONE_CENTER)
    // Released: the pointer is up, so grabbing clears at once.
    expect(grabbingStyle()).toBeNull()
  })

  test('Escape (a Cancel) also clears the grabbing cursor', () => {
    const DA = createDropAction<Data>({ measure })
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    expect(grabbingStyle()).not.toBeNull()
    pressEscape()
    expect(grabbingStyle()).toBeNull()
  })

  test('unmounting the Item mid-drag still clears the cursor on release', () => {
    // The cursor is tied to the pointer gesture (window listeners), not to the
    // component tree: a release still reaches onUp even after the Item unmounts.
    const DA = createDropAction<Data>({ measure })
    const view = render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    expect(grabbingStyle()).not.toBeNull()

    // The source Item unmounts mid-drag (e.g. an optimistic list change).
    view.rerender(
      <DA.Zone id="slot" onDrop={() => {}}>
        slot
      </DA.Zone>,
    )
    // The drag's window listeners survive, so releasing still clears the cursor.
    release(ZONE_CENTER)
    expect(grabbingStyle()).toBeNull()
  })

  test('grabCursor: false injects no global grabbing cursor', () => {
    const DA = createDropAction<Data>({ measure, grabCursor: false })
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={() => {}}>
          slot
        </DA.Zone>
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    expect(grabbingStyle()).toBeNull()
    release(ZONE_CENTER)
  })
})

// One Active per Drop Action (ADR-0029): a single in-flight drag per Drop
// Action. A second concurrent start — a bubbled double-trigger or a second
// pointer — is ignored; multi-pointer simultaneous drag is out of scope.
describe('createDropAction — one Active per Drop Action (ADR-0029)', () => {
  test('a default Item wrapping a useDragHandle fires onDrop once, not twice', () => {
    const DA = createDropAction<Data>({ measure })
    const onDrop = vi.fn()
    function InnerHandle() {
      const handleProps = DA.useDragHandle('card')
      return (
        <span data-testid="inner-handle" {...handleProps}>
          grip
        </span>
      )
    }
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          <InnerHandle />
        </DA.Item>
        <DA.Zone id="slot" onDrop={onDrop}>
          slot
        </DA.Zone>
      </>,
    )

    // Pressing the inner handle bubbles to the default Item wrapper, so one
    // press calls startDrag('card') twice (inner trigger + bubbled wrapper
    // trigger). The in-flight guard collapses it to a single drag — and a
    // single Drop — instead of double-firing onDrop.
    press(screen.getByTestId('inner-handle'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    expect(onDrop).toHaveBeenCalledTimes(1)
  })

  test('a second concurrent pointer does not start a drag (multi-pointer is out of scope)', () => {
    const DA = createDropAction<Data>({ measure })
    const onDrop = vi.fn()
    render(
      <>
        <DA.Item id="a" data={{ label: 'A' }}>
          a
        </DA.Item>
        <DA.Item id="b" data={{ label: 'B' }}>
          b
        </DA.Item>
        <DA.Zone id="slot" onDrop={onDrop}>
          slot
        </DA.Zone>
      </>,
    )
    const [a, b] = screen.getAllByRole('button')

    // Finger 1 presses A and crosses the threshold → A is dragging.
    fireEvent.pointerDown(a, { clientX: 50, clientY: 50, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 250, clientY: 50, pointerId: 1 })
    // Finger 2 presses B while A is in flight: the guard blocks it, so B's
    // pointer drives no drag of its own.
    fireEvent.pointerDown(b, { clientX: 50, clientY: 50, pointerId: 2 })
    fireEvent.pointerMove(window, { clientX: 250, clientY: 50, pointerId: 2 })
    fireEvent.pointerUp(window, { clientX: 250, clientY: 50, pointerId: 2 })
    fireEvent.pointerUp(window, { clientX: 250, clientY: 50, pointerId: 1 })

    // Exactly one Drop fired, for the Item that won the race (A).
    expect(onDrop).toHaveBeenCalledTimes(1)
    const [dragged] = onDrop.mock.calls[0] as [DraggedItem<Data>]
    expect(dragged.id).toBe('a')
  })

  test('a press released before activation frees the Drop Action for the next drag', () => {
    const DA = createDropAction<Data>({ measure })
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
    const item = screen.getByRole('button')

    // A click: press and release with no move past the threshold — never a drag.
    press(item, ITEM_CENTER)
    release(ITEM_CENTER)

    // A real drag afterward still works: the abandoned press cleared the flag.
    press(item, ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    expect(onDrop).toHaveBeenCalledTimes(1)
  })

  test('a touch swipe that abandons activation frees the Drop Action', () => {
    const DA = createDropAction<Data>({ measure })
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
    const item = screen.getByRole('button')

    // A swipe beyond tolerance before the delay → 'cancel', the drag never
    // begins (the list scrolls instead).
    fireEvent.pointerDown(item, {
      clientX: 50,
      clientY: 50,
      pointerId: 1,
      pointerType: 'touch',
    })
    fireEvent.pointerMove(window, {
      clientX: 50,
      clientY: 90,
      pointerId: 1,
      pointerType: 'touch',
    })
    fireEvent.pointerUp(window, {
      clientX: 50,
      clientY: 90,
      pointerId: 1,
      pointerType: 'touch',
    })

    // A later drag still works: the abandoned swipe cleared the in-flight flag.
    press(item, ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    expect(onDrop).toHaveBeenCalledTimes(1)
  })
})
