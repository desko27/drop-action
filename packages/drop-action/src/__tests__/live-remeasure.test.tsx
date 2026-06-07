import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDropAction } from '../main'
import type { DwellHandler, Measure, Rect } from '../main'

// An active drag must keep re-measuring as the tree changes shape under it
// (ADR-0026): targets that mount mid-drag must become detectable, and targets
// whose rects shift (a reflow that is neither scroll nor resize) must be hit at
// their new position. happy-dom does no layout, so geometry is injected through
// `measure`, and the ResizeObserver / MutationObserver are stubbed so their
// callbacks can be fired deterministically.

type Data = { label: string }

const ITEM_RECT: Rect = {
  top: 0,
  left: 0,
  right: 100,
  bottom: 100,
  width: 100,
  height: 100,
}
// The Hover target ("folder"), 200..300 on x. SHIFTED is the same box moved
// right to 300..400 — a reflow with no scroll/resize/registry change.
const FOLDER_RECT: Rect = {
  top: 0,
  left: 200,
  right: 300,
  bottom: 100,
  width: 100,
  height: 100,
}
const SHIFTED_RECT: Rect = {
  top: 0,
  left: 300,
  right: 400,
  bottom: 100,
  width: 100,
  height: 100,
}

const ITEM_CENTER = { x: 50, y: 50 }
const IN_FOLDER = { x: 250, y: 50 }
// Inside SHIFTED only (300..400), clear of FOLDER (200..300).
const IN_SHIFTED = { x: 350, y: 50 }

let folderRect: Rect = FOLDER_RECT
let hoverMeasures = 0
// When set, every Hover measure returns a fresh box (top = call count) so the
// snapshot never stabilises — exercises the burst's hard cap.
let neverSettles = false
const measure: Measure = ({ type }) => {
  if (type === 'item') return ITEM_RECT
  if (type === 'hover') {
    hoverMeasures += 1
    if (neverSettles)
      return {
        top: hoverMeasures,
        left: 200,
        right: 300,
        bottom: hoverMeasures + 100,
        width: 100,
        height: 100,
      }
    return folderRect
  }
  return folderRect
}

type FakeObserver = {
  trigger: () => void
}
let resizeObservers: Array<FakeObserver & { observed: unknown[] }> = []
let mutationObservers: Array<
  FakeObserver & { observeArgs: Array<{ options?: MutationObserverInit }> }
> = []

const press = (node: Element, at: { x: number; y: number }) =>
  fireEvent.pointerDown(node, { clientX: at.x, clientY: at.y, pointerId: 1 })
const move = (at: { x: number; y: number }) =>
  fireEvent.pointerMove(window, { clientX: at.x, clientY: at.y, pointerId: 1 })
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const fireResize = () =>
  act(() => {
    for (const o of resizeObservers) o.trigger()
  })

beforeEach(() => {
  folderRect = FOLDER_RECT
  hoverMeasures = 0
  neverSettles = false
  resizeObservers = []
  mutationObservers = []

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  // Run the engine's rAF synchronously so a trigger drives the whole settle
  // burst within the surrounding act() (the burst self-terminates, so the
  // synchronous recursion is bounded by the stability check / frame cap).
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})

  class FakeResizeObserver {
    private cb: ResizeObserverCallback
    observed: unknown[] = []
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb
      resizeObservers.push(this)
    }
    observe(target: unknown) {
      this.observed.push(target)
    }
    unobserve() {}
    disconnect() {}
    trigger() {
      this.cb([], this as unknown as ResizeObserver)
    }
  }
  class FakeMutationObserver {
    private cb: MutationCallback
    observeArgs: Array<{ options?: MutationObserverInit }> = []
    constructor(cb: MutationCallback) {
      this.cb = cb
      mutationObservers.push(this)
    }
    observe(_target: Node, options?: MutationObserverInit) {
      this.observeArgs.push({ options })
    }
    disconnect() {}
    takeRecords() {
      return []
    }
    trigger() {
      this.cb([], this as unknown as MutationObserver)
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('MutationObserver', FakeMutationObserver)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// A Drop Action whose single Hover target is mounted/unmounted via a toggle, so
// a test can register or unregister it mid-drag.
const mountToggleable = (onDwell: DwellHandler<Data>) => {
  const DA = createDropAction<Data>({ measure })
  let setShown!: (v: boolean) => void
  function Tree() {
    const [shown, setShownState] = useState(false)
    setShown = setShownState
    const { ref, isDwelling } = DA.useDwell('folder', { onDwell })
    return (
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        {shown ? (
          <div
            ref={ref}
            data-testid="folder"
            data-dwelling={isDwelling || undefined}
          />
        ) : null}
      </>
    )
  }
  render(<Tree />)
  return { setShown: (v: boolean) => act(() => setShown(v)) }
}

describe('live re-measure on DOM/layout change (ADR-0026)', () => {
  test('a Hover target mounted mid-drag is detected without a pointer move', () => {
    const onDwell = vi.fn()
    const { setShown } = mountToggleable(onDwell)

    // Drag begins, cursor parked where the folder *will* be — but it is not
    // mounted yet, so nothing is Hovered and no dwell is armed.
    press(screen.getByRole('button'), ITEM_CENTER)
    move(IN_FOLDER)
    advance(500)
    expect(onDwell).not.toHaveBeenCalled()

    // Mount the folder under the (still) cursor. The registry hook re-measures
    // at once, so it enters the Hover pass and arms the dwell — no scroll, no
    // pointer move.
    setShown(true)
    expect(screen.getByTestId('folder')).toHaveAttribute('data-dwelling')
    advance(500)
    expect(onDwell).toHaveBeenCalledTimes(1)
  })

  test('a shifted Hover target is hit at its new position via the ResizeObserver', () => {
    const onDwell = vi.fn()
    const { setShown } = mountToggleable(onDwell)
    setShown(true)

    // Cursor sits in SHIFTED's box, clear of the folder's current box: not
    // Hovered, nothing armed.
    press(screen.getByRole('button'), ITEM_CENTER)
    move(IN_SHIFTED)
    advance(500)
    expect(onDwell).not.toHaveBeenCalled()

    // The folder reflows right (no scroll, no resize, no registry change). A
    // ResizeObserver fire drives the settle burst, which re-measures and now
    // resolves Hover against the new rect.
    folderRect = SHIFTED_RECT
    fireResize()
    expect(screen.getByTestId('folder')).toHaveAttribute('data-dwelling')
    advance(500)
    expect(onDwell).toHaveBeenCalledTimes(1)
  })

  test('unmounting a Hover target mid-drag cancels its pending dwell', () => {
    const onDwell = vi.fn()
    const { setShown } = mountToggleable(onDwell)
    setShown(true)

    press(screen.getByRole('button'), ITEM_CENTER)
    move(IN_FOLDER)
    advance(300)
    // The folder unmounts before the dwell completes: the registry hook
    // re-measures it out of the pass and the pending dwell is cleared.
    setShown(false)
    advance(500)
    expect(onDwell).not.toHaveBeenCalled()
  })

  test('the MutationObserver watches childList only — never attributes', () => {
    // The Overlay is moved by a per-frame `style.transform` write (ADR-0018);
    // an attributes observer would fire on each write and re-measure every
    // frame. childList-only keeps the observer feedback-safe.
    mountToggleable(vi.fn()).setShown(true)
    press(screen.getByRole('button'), ITEM_CENTER)
    move(IN_FOLDER) // cross the activation distance so the drag truly begins

    expect(mutationObservers).toHaveLength(1)
    const args = mutationObservers[0].observeArgs
    expect(args).toContainEqual({
      options: { childList: true, subtree: true },
    })
    for (const { options } of args) expect(options?.attributes).toBeFalsy()
  })

  test('the ResizeObserver watches every target node and the document root', () => {
    mountToggleable(vi.fn()).setShown(true)
    press(screen.getByRole('button'), ITEM_CENTER)
    move(IN_FOLDER) // cross the activation distance so the drag truly begins

    expect(resizeObservers).toHaveLength(1)
    const observed = resizeObservers[0].observed
    expect(observed).toContain(document.documentElement)
    expect(observed).toContain(screen.getByTestId('folder'))
  })
})

describe('settle burst — adaptive stop and hard cap (ADR-0026)', () => {
  const startDragWithFolder = () => {
    const onDwell = vi.fn()
    const { setShown } = mountToggleable(onDwell)
    setShown(true)
    press(screen.getByRole('button'), ITEM_CENTER)
    move(IN_FOLDER)
    hoverMeasures = 0
  }

  test('a burst over a stable layout stops within a few frames, not the cap', () => {
    startDragWithFolder()

    fireResize()
    // Re-reads until two consecutive identical frames, then stops — far below
    // the 20-frame cap.
    expect(hoverMeasures).toBeGreaterThan(0)
    expect(hoverMeasures).toBeLessThanOrEqual(4)

    // A fresh trigger re-arms a new burst (re-extension is not a dead burst).
    const afterFirst = hoverMeasures
    fireResize()
    expect(hoverMeasures).toBeGreaterThan(afterFirst)
  })

  test('a layout that never settles is bounded by the hard frame cap', () => {
    startDragWithFolder()

    neverSettles = true
    fireResize()
    // Every frame measures a different rect, so the stability check never trips
    // and the burst runs exactly to the cap (20 frames) rather than forever.
    expect(hoverMeasures).toBe(20)
  })
})
