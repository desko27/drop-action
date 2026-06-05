import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDropAction } from '../main'
import type { Measure, Rect } from '../main'

type Data = { label: string }

// Synthetic geometry injected through the measure boundary (happy-dom
// reports zero-sized rects), mirroring the public-API behaviour seam.
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

describe('headless ergonomics — hooks with no wrapper node', () => {
  test('useItem/useZone drive a drop directly on <li>/<tr> with no extra node', () => {
    const DA = createDropAction<Data>('hooks', { measure })
    const onDrop = vi.fn()

    function Card() {
      const { ref, dragHandleProps } = DA.useItem('card', { label: 'Card' })
      return (
        <li ref={ref} {...dragHandleProps}>
          card
        </li>
      )
    }
    function Slot() {
      const { ref } = DA.useZone('slot', { onDrop })
      return (
        <tr ref={ref}>
          <td>slot</td>
        </tr>
      )
    }

    render(
      <ul>
        <Card />
        <table>
          <tbody>
            <Slot />
          </tbody>
        </table>
      </ul>,
    )

    const handle = screen.getByRole('button')
    // The handle is the <li> itself — no wrapping div was introduced.
    expect(handle.tagName).toBe('LI')

    press(handle, ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)

    expect(onDrop).toHaveBeenCalledTimes(1)
  })
})

describe('headless ergonomics — Item `as` wrapper', () => {
  test('as renders the chosen wrapper element', () => {
    const DA = createDropAction<Data>('as', { measure })
    render(
      <DA.Item id="card" data={{ label: 'Card' }} as="span">
        card
      </DA.Item>,
    )
    expect(screen.getByRole('button').tagName).toBe('SPAN')
  })
})

describe('headless ergonomics — custom drag handle (ADR-0009)', () => {
  test('the Item body does NOT start a drag; the external handle does', () => {
    const DA = createDropAction<Data>('custom-handle', { measure })
    const onDrop = vi.fn()

    function Tree() {
      const { ref, dragHandleProps } = DA.useItem(
        'card',
        { label: 'Card' },
        { customDragHandle: true },
      )
      const handleProps = DA.useDragHandle('card')
      return (
        <>
          {/* Handle rendered OUTSIDE the Item subtree (a toolbar). */}
          <header>
            <button type="button" data-testid="handle" {...handleProps}>
              grab
            </button>
          </header>
          <div ref={ref} data-testid="item" {...dragHandleProps}>
            <button type="button" data-testid="inner">
              click me
            </button>
          </div>
        </>
      )
    }

    render(
      <>
        <Tree />
        <DA.Zone id="slot" onDrop={onDrop}>
          slot
        </DA.Zone>
      </>,
    )

    // The Item body is a container, not a trigger.
    const item = screen.getByTestId('item')
    expect(item).toHaveAttribute('role', 'group')

    // Pressing the Item body starts no drag.
    press(item, ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)
    expect(onDrop).not.toHaveBeenCalled()

    // Pressing a non-handle interactive element inside starts no drag.
    press(screen.getByTestId('inner'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)
    expect(onDrop).not.toHaveBeenCalled()

    // Pressing the external handle DOES start a drag and a drop works.
    press(screen.getByTestId('handle'), ITEM_CENTER)
    move(ZONE_CENTER)
    release(ZONE_CENTER)
    expect(onDrop).toHaveBeenCalledTimes(1)
  })

  test('useDragHandle carries the ARIA defaults and defensive CSS', () => {
    const DA = createDropAction<Data>('handle-aria', { measure })
    function Tree() {
      const { ref, dragHandleProps } = DA.useItem(
        'card',
        { label: 'Card' },
        { customDragHandle: true },
      )
      const handleProps = DA.useDragHandle('card')
      return (
        <div ref={ref} {...dragHandleProps}>
          <span data-testid="handle" {...handleProps}>
            grab
          </span>
        </div>
      )
    }
    render(<Tree />)

    const handle = screen.getByTestId('handle')
    expect(handle).toHaveAttribute('role', 'button')
    expect(handle).toHaveAttribute('tabindex', '0')
    expect(handle).toHaveAttribute('aria-roledescription', 'draggable')
    // Idle: userSelect is suppressed; touch-action stays default so a touch
    // list scrolls until a drag actually begins (ADR-0012). touch-action:none
    // is applied only while dragging.
    expect(handle).toHaveStyle({ userSelect: 'none' })
  })
})

describe('headless ergonomics — default Item ARIA defaults', () => {
  test('the default Item is the handle with button a11y + defensive CSS', () => {
    const DA = createDropAction<Data>('default-aria', { measure })
    render(
      <DA.Item id="card" data={{ label: 'Card' }}>
        card
      </DA.Item>,
    )
    const handle = screen.getByRole('button')
    expect(handle).toHaveAttribute('tabindex', '0')
    expect(handle).toHaveAttribute('aria-roledescription', 'draggable')
    // Idle: only userSelect is suppressed; touch-action:none applies while
    // dragging (ADR-0012), so a touch list stays scrollable until activation.
    expect(handle).toHaveStyle({ userSelect: 'none' })
  })
})
