import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDropAction } from '../main'
import type { Measure, Rect } from '../main'

type Data = { label: string }

const rect = (
  left: number,
  top: number,
  right: number,
  bottom: number,
): Rect => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
})

const ITEM_RECT = rect(0, 0, 100, 100)
// The Zone is 400px wide (200..600) but lives inside a 200px-wide scroll window
// (200..400), so its right half (400..600) is scrolled out of view. Mutable so a
// test can "scroll" the Zone by changing where its raw rect reports it.
let zoneRaw = rect(200, 0, 600, 100)
const CLIP_BOX = rect(200, 0, 400, 100)

const measure: Measure = ({ type }) => (type === 'zone' ? zoneRaw : ITEM_RECT)

const press = (node: Element, at: { x: number; y: number }) =>
  fireEvent.pointerDown(node, { clientX: at.x, clientY: at.y, pointerId: 1 })
const move = (at: { x: number; y: number }) =>
  fireEvent.pointerMove(window, { clientX: at.x, clientY: at.y, pointerId: 1 })
const release = (at: { x: number; y: number }) =>
  fireEvent.pointerUp(window, { clientX: at.x, clientY: at.y, pointerId: 1 })

beforeEach(() => {
  zoneRaw = rect(200, 0, 600, 100)
  // Run the rAF throttle (move flush and scroll re-measure) synchronously.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => vi.unstubAllGlobals())

const renderBoard = () => {
  const DA = createDropAction<Data>({ measure })
  const onDrop = vi.fn()
  render(
    <>
      <DA.Item id="card" data={{ label: 'Card' }}>
        card
      </DA.Item>
      <div data-testid="scroller" style={{ overflow: 'scroll' }}>
        <DA.Zone id="z" onDrop={onDrop}>
          z
        </DA.Zone>
      </div>
    </>,
  )
  // The scroll window the Zone lives in. happy-dom can't lay out, so pin the
  // container's box; the Zone's own position comes from the measure mock.
  const scroller = screen.getByTestId('scroller')
  scroller.getBoundingClientRect = () => CLIP_BOX as DOMRect
  return { onDrop }
}

describe('createDropAction — collision clipped to the visible Zone region (ADR-0023)', () => {
  test('the hidden part of a Zone scrolled out behind an overflow ancestor cannot be Over', () => {
    const { onDrop } = renderBoard()
    press(screen.getByRole('button'), { x: 50, y: 50 })
    // Steer the Overlay over the Zone's hidden half (450..550 ⊂ 400..600).
    move({ x: 500, y: 50 })
    release({ x: 500, y: 50 })
    expect(onDrop).not.toHaveBeenCalled()
  })

  test('the visible part of the same Zone still routes the Drop', () => {
    const { onDrop } = renderBoard()
    press(screen.getByRole('button'), { x: 50, y: 50 })
    // Steer over the visible half (250..350 ⊂ 200..400).
    move({ x: 300, y: 50 })
    release({ x: 300, y: 50 })
    expect(onDrop).toHaveBeenCalledTimes(1)
  })

  test('a Zone scrolled back into view mid-drag re-enters collision', () => {
    const { onDrop } = renderBoard()
    // Start fully scrolled out: the Zone sits to the right of the window.
    zoneRaw = rect(700, 0, 1100, 100)
    press(screen.getByRole('button'), { x: 50, y: 50 })
    // Overlay rests over the window (250..350), but the Zone is out of view.
    move({ x: 300, y: 50 })
    // Scrolling brings the Zone into the window; the capture-phase scroll
    // listener re-measures, and the Zone re-enters the snapshot.
    zoneRaw = rect(200, 0, 600, 100)
    fireEvent.scroll(screen.getByTestId('scroller'))
    release({ x: 300, y: 50 })
    expect(onDrop).toHaveBeenCalledTimes(1)
  })
})
