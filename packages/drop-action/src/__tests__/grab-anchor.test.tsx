import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { center, createDropAction } from '../main'
import type { GrabAnchorArgs, Measure, Rect } from '../main'
import { snapBack } from '../snap-back'

type Data = { label: string }

// A 100x100 source whose travelling Overlay is a compact 40x40 chip — the
// size mismatch the grab anchor exists for (ADR-0021).
const SOURCE_RECT: Rect = {
  top: 0,
  left: 0,
  right: 100,
  bottom: 100,
  width: 100,
  height: 100,
}
const CHIP_RECT: Rect = {
  top: 0,
  left: 0,
  right: 40,
  bottom: 40,
  width: 40,
  height: 40,
}

// The Overlay measures as the chip; the source (and anything else) as 100x100.
const measure: Measure = ({ type }) =>
  type === 'overlay' ? CHIP_RECT : SOURCE_RECT

const press = (node: Element, at: { x: number; y: number }) =>
  fireEvent.pointerDown(node, { clientX: at.x, clientY: at.y, pointerId: 1 })
const move = (at: { x: number; y: number }) =>
  fireEvent.pointerMove(window, { clientX: at.x, clientY: at.y, pointerId: 1 })
const release = (at: { x: number; y: number }) =>
  fireEvent.pointerUp(window, { clientX: at.x, clientY: at.y, pointerId: 1 })

const flush = () => act(async () => {})

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

// The styled Overlay div <Active> / <ActiveSnapBack> render the testid child into.
const overlay = () => screen.queryByTestId('overlay')?.parentElement ?? null

// Mount an Item + <Active> for `DA`, press at `grab`, then move to `to`. The
// first move activates the drag and mounts <Active> so the engine measures the
// chip Overlay; the second (with the chip now measured) recomputes the
// transform against it — the same two-move pattern the ADR-0020 suite uses,
// since the first frame falls back to the source size until the Overlay mounts.
const dragChip = (
  DA: ReturnType<typeof createDropAction<Data>>,
  grab: { x: number; y: number },
  to: { x: number; y: number },
) => {
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
  press(screen.getByRole('button'), grab)
  move(to)
  move(to)
}

describe('grab anchor — where the Overlay hangs from the pointer (ADR-0021)', () => {
  test("default 'proportional' keeps the press's fractional grip on the chip", () => {
    const DA = createDropAction<Data>({ measure })
    // Grab 90% across the 100px source, drag right by 100.
    dragChip(DA, { x: 90, y: 50 }, { x: 190, y: 50 })
    // Anchored origin = grab - frac*chip = (90,50) - (0.9*40, 0.5*40) = (54,30);
    // + transform (100,0) -> (154,30). The pointer (190) lands inside the chip
    // (154..194), not in the void a source-absolute offset would have left.
    expect(overlay()?.style.transform).toBe('translate3d(154px, 30px, 0)')
  })

  test("'preserve' keeps the source-absolute offset (and can leave the void)", () => {
    const DA = createDropAction<Data>({ measure, grabAnchor: 'preserve' })
    dragChip(DA, { x: 90, y: 50 }, { x: 190, y: 50 })
    // Anchored origin stays the source top-left (0,0); + transform (100,0).
    // The chip spans 100..140 while the pointer is at 190 — the void preserve
    // accepts in exchange for pixel-exact alignment when sizes match.
    expect(overlay()?.style.transform).toBe('translate3d(100px, 0px, 0)')
  })

  test('a fixed point (`center`) pins that fraction of the chip under the pointer', () => {
    const DA = createDropAction<Data>({ measure, grabAnchor: center })
    dragChip(DA, { x: 50, y: 50 }, { x: 150, y: 50 })
    // Anchored origin = (50,50) - (0.5*40, 0.5*40) = (30,30); + (100,0).
    expect(overlay()?.style.transform).toBe('translate3d(130px, 30px, 0)')
  })

  test('a per-Item grabAnchor overrides the Drop Action default', () => {
    // Action says 'preserve'; the Item overrides with center, which must win.
    const DA = createDropAction<Data>({ measure, grabAnchor: 'preserve' })
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }} grabAnchor={center}>
          card
        </DA.Item>
        <DA.Active>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </DA.Active>
      </>,
    )
    press(screen.getByRole('button'), { x: 50, y: 50 })
    move({ x: 150, y: 50 })
    move({ x: 150, y: 50 })
    // center, not preserve: (50,50) - (20,20) = (30,30); + (100,0) -> (130,30).
    expect(overlay()?.style.transform).toBe('translate3d(130px, 30px, 0)')
  })

  test('a grabAnchor function receives the measured chip size and the grab point', () => {
    const fn = vi.fn((_args: GrabAnchorArgs) => ({ x: 1, y: 1 }))
    const DA = createDropAction<Data>({ measure, grabAnchor: fn })
    dragChip(DA, { x: 50, y: 50 }, { x: 150, y: 50 })
    // Bottom-right anchor with the measured 40px chip: origin (50,50)-(40,40) =
    // (10,10); + (100,0) -> (110,10). (A 100px source size would give (50,-50),
    // proving the measured Overlay size is what flows in.)
    expect(overlay()?.style.transform).toBe('translate3d(110px, 10px, 0)')
    expect(fn).toHaveBeenLastCalledWith(
      expect.objectContaining({
        overlaySize: { width: 40, height: 40 },
        grab: { x: 50, y: 50 },
      }),
    )
  })
})

describe('Return homes the Overlay centered on the source (ADR-0022)', () => {
  test('a No-drop returns the chip centered on the source, not to its corner', async () => {
    const DA = createDropAction<Data>({ measure })
    const { ActiveSnapBack } = snapBack<Data>()(DA)

    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <ActiveSnapBack>
          {({ data }) => <div data-testid="overlay">{data.label}</div>}
        </ActiveSnapBack>
      </>,
    )

    press(screen.getByRole('button'), { x: 50, y: 50 })
    // Drag clear of any Zone and release: a No-drop Return.
    move({ x: 400, y: 400 })
    release({ x: 400, y: 400 })
    await flush()

    // home = source.left + (source.width - chip.width)/2 = 0 + (100-40)/2 = 30
    // on both axes — the chip eases into the middle of its slot. Top-left homing
    // would have left it at (0,0).
    expect(overlay()?.style.transform).toBe('translate3d(30px, 30px, 0)')
  })
})
