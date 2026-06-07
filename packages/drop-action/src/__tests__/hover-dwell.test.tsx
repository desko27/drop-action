import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDropAction } from '../main'
import type { DwellHandler, Measure, Rect } from '../main'

type Data = { label: string }

// Synthetic geometry: the source Item, and a Hover target ("folder") off to the
// right. The Hover hit-test is pointer-only (ADR-0024), so what matters is the
// pointer's clientX/clientY relative to FOLDER_RECT — not the Overlay.
const ITEM_RECT: Rect = {
  top: 0,
  left: 0,
  right: 100,
  bottom: 100,
  width: 100,
  height: 100,
}
const FOLDER_RECT: Rect = {
  top: 0,
  left: 200,
  right: 300,
  bottom: 100,
  width: 100,
  height: 100,
}
const measure: Measure = ({ type }) =>
  type === 'item' ? ITEM_RECT : FOLDER_RECT

const ITEM_CENTER = { x: 50, y: 50 }
const IN_FOLDER = { x: 250, y: 50 }
// Still inside the folder but >8px (the default tolerance) from IN_FOLDER.
const IN_FOLDER_FAR = { x: 270, y: 50 }
// Clear of the folder (200..300 on x): a No-drop spot with no Hover target.
const OUTSIDE = { x: 600, y: 50 }

const press = (node: Element, at: { x: number; y: number }) =>
  fireEvent.pointerDown(node, { clientX: at.x, clientY: at.y, pointerId: 1 })
const move = (at: { x: number; y: number }) =>
  fireEvent.pointerMove(window, { clientX: at.x, clientY: at.y, pointerId: 1 })
const release = (at: { x: number; y: number }) =>
  fireEvent.pointerUp(window, { clientX: at.x, clientY: at.y, pointerId: 1 })

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => {
  // Fake only the dwell timer; run the engine's rAF flush synchronously so a
  // moved pointer recomputes Hover within the surrounding act() flush.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useHover — observe-only over-detection (ADR-0024)', () => {
  test('isHovering tracks the cursor entering and leaving the Hover target', () => {
    const DA = createDropAction<Data>({ measure })
    function Watcher() {
      const { ref, isHovering } = DA.useHover('folder')
      return (
        <div ref={ref} data-testid="folder">
          {isHovering ? 'in' : 'out'}
        </div>
      )
    }

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <Watcher />
      </>,
    )

    expect(screen.getByTestId('folder')).toHaveTextContent('out')

    // Activate the drag with the cursor landing inside the folder.
    press(screen.getByRole('button'), ITEM_CENTER)
    move(IN_FOLDER)
    expect(screen.getByTestId('folder')).toHaveTextContent('in')

    // Move clear of the folder: the Hover transition flips it back.
    move(OUTSIDE)
    expect(screen.getByTestId('folder')).toHaveTextContent('out')
  })
})

describe('useDwell — settle timing in the engine (ADR-0024)', () => {
  const mount = (onDwell: DwellHandler<Data>) => {
    const DA = createDropAction<Data>({ measure })
    function Folder() {
      const { ref, isDwelling } = DA.useDwell('folder', { onDwell })
      return (
        <div
          ref={ref}
          data-testid="folder"
          data-dwelling={isDwelling || undefined}
        />
      )
    }
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <Folder />
      </>,
    )
  }

  test('onDwell fires once after the cursor settles for dwellMs', () => {
    const onDwell = vi.fn()
    mount(onDwell)

    press(screen.getByRole('button'), ITEM_CENTER)
    move(IN_FOLDER)
    // isDwelling is the immediate cursor-inside signal, true before the fire.
    expect(screen.getByTestId('folder')).toHaveAttribute('data-dwelling')

    advance(499)
    expect(onDwell).not.toHaveBeenCalled()
    advance(1)
    // Fires once, with the dragged Item (the Active), at the 500ms default.
    expect(onDwell).toHaveBeenCalledTimes(1)
    expect(onDwell).toHaveBeenCalledWith({
      id: 'card',
      data: { label: 'Card' },
    })

    // Staying settled does not re-fire.
    advance(1000)
    expect(onDwell).toHaveBeenCalledTimes(1)
  })

  test('moving past the tolerance re-anchors and restarts the timer', () => {
    const onDwell = vi.fn()
    mount(onDwell)

    press(screen.getByRole('button'), ITEM_CENTER)
    move(IN_FOLDER)
    advance(300)
    // Still inside the folder, but >8px from the settle point: re-anchor.
    move(IN_FOLDER_FAR)
    advance(300)
    // Only 300ms since the re-anchor — not yet fired.
    expect(onDwell).not.toHaveBeenCalled()
    advance(200)
    // 500ms settled at the new anchor: fires now.
    expect(onDwell).toHaveBeenCalledTimes(1)
  })

  test('leaving the target cancels a pending dwell', () => {
    const onDwell = vi.fn()
    mount(onDwell)

    press(screen.getByRole('button'), ITEM_CENTER)
    move(IN_FOLDER)
    advance(300)
    move(OUTSIDE)
    advance(500)
    expect(onDwell).not.toHaveBeenCalled()
    // The immediate signal also dropped.
    expect(screen.getByTestId('folder')).not.toHaveAttribute('data-dwelling')
  })

  test('releasing cancels a pending dwell — onDwell never fires after drag end', () => {
    const onDwell = vi.fn()
    mount(onDwell)

    press(screen.getByRole('button'), ITEM_CENTER)
    move(IN_FOLDER)
    advance(300)
    // Release over the Hover target: it is observe-only, so this is a No-drop,
    // and cleanup clears the pending dwell.
    release(IN_FOLDER)
    advance(500)
    expect(onDwell).not.toHaveBeenCalled()
  })
})
