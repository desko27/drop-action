import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDropAction, restrictToVerticalAxis, snapToGrid } from '../main'
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

  test('the Active Overlay renders in a document.body portal and follows the pointer', async () => {
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
    const DA = createDropAction<Data>('vertical', {
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
    const DA = createDropAction<Data>('grid', {
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

  test('useActive reflects the Active Item (id, data, status, originRect) during a drag and is null otherwise', async () => {
    const DA = createDropAction<Data>('use-active', { measure })
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
    const DA = createDropAction<Data>('use-over', { measure })
    function Probe({ zoneId }: { zoneId: string }) {
      const over = DA.useOver(zoneId)
      return <div data-testid={`over-${zoneId}`}>{over ? over.id : 'none'}</div>
    }
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
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

  test('useItem(...).isDragging is true for the dragged Item and false otherwise', async () => {
    const DA = createDropAction<Data>('is-dragging', { measure })
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
    const DA = createDropAction<Data>('container', { measure })
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

  test('useDropEvent fires for a remote listener with { id, data } and a working respond', () => {
    const DA = createDropAction<Data>('remote', { measure })
    const onDrop = vi.fn(
      (_item: DraggedItem<Data>, respond: (s: 'accepted') => void) =>
        respond('accepted'),
    )
    const onAccept = vi.fn()

    // The Zone is rendered with NO onDrop; the handler lives in a separate
    // component subscribing via useDropEvent — Drop handling far from the
    // Zone (issue #9).
    function RemoteListener() {
      DA.useDropEvent('slot', onDrop)
      return null
    }

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }} onAccept={onAccept}>
          card
        </DA.Item>
        <DA.Zone id="slot">slot</DA.Zone>
        <RemoteListener />
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    expect(onDrop).toHaveBeenCalledTimes(1)
    const [dragged] = onDrop.mock.calls[0]
    expect(dragged).toEqual({ id: 'card', data: { label: 'Card' } })
    // respond('accepted') from the remote listener runs the Item's onAccept.
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onAccept).toHaveBeenCalledWith({
      id: 'card',
      data: { label: 'Card' },
    })
  })

  test("Zone's onDrop is sugar over useDropEvent — both fire for one Drop", () => {
    const DA = createDropAction<Data>('sugar', { measure })
    const zoneOnDrop = vi.fn()
    const remoteOnDrop = vi.fn()

    function RemoteListener() {
      DA.useDropEvent('slot', remoteOnDrop)
      return null
    }

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="slot" onDrop={zoneOnDrop}>
          slot
        </DA.Zone>
        <RemoteListener />
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    // The Zone's own onDrop and the remote listener share one registry.
    expect(zoneOnDrop).toHaveBeenCalledTimes(1)
    expect(remoteOnDrop).toHaveBeenCalledTimes(1)
    const [dragged] = zoneOnDrop.mock.calls[0] as [DraggedItem<Data>]
    expect(dragged).toEqual({ id: 'card', data: { label: 'Card' } })
  })

  test('a Drop on one Zone does not fire a listener registered for another', () => {
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
    const DA = createDropAction<Data>('isolation', {
      measure: isolationMeasure,
    })
    const onA = vi.fn()
    const onB = vi.fn()

    function Listeners() {
      DA.useDropEvent('a', onA)
      DA.useDropEvent('b', onB)
      return null
    }

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Zone id="a">zone a</DA.Zone>
        <DA.Zone id="b">zone b</DA.Zone>
        <Listeners />
      </>,
    )

    press(screen.getByRole('button'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    expect(onB).toHaveBeenCalledTimes(1)
    expect(onA).not.toHaveBeenCalled()
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

// Async resolution, the Dropping status, and cancellation (ADR-0003,
// ADR-0004). A Drop may await before responding; only respond('accepted')
// runs onAccept; Esc and pointercancel abort with no Drop at all.
describe('createDropAction — async resolution, status, cancellation', () => {
  test('a Zone that awaits before responding accepts after the delay', async () => {
    const action = createDropAction<Data>('async-accept', { measure })
    const onAccept = vi.fn()
    let resolve: (() => void) | undefined
    const onDrop = async (
      _item: DraggedItem<Data>,
      respond: (s: 'accepted') => void,
    ) => {
      await new Promise<void>((r) => {
        resolve = r
      })
      respond('accepted')
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
    expect(onAccept).toHaveBeenCalledWith({
      id: 'card',
      data: { label: 'Card' },
    })
    expect(screen.queryByTestId('overlay')).toBeNull()
  })

  test('a Zone that awaits then never responds rejects after the delay', async () => {
    const action = createDropAction<Data>('async-reject', { measure })
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

  test('a synchronous respond("accepted") accepts within the release', async () => {
    const action = createDropAction<Data>('sync-accept', { measure })
    const onAccept = vi.fn()

    render(
      <>
        <action.Item id="card" data={{ label: 'Card' }} onAccept={onAccept}>
          card
        </action.Item>
        <action.Zone id="slot" onDrop={(_item, respond) => respond('accepted')}>
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
    const action = createDropAction<Data>('esc-cancel', { measure })
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
    const action = createDropAction<Data>('pointercancel', { measure })
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
