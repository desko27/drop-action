import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { autoScroll } from '../auto-scroll'
import { createDropAction } from '../main'
import type { Measure, Rect } from '../main'

type Data = { label: string }

// The source Item; the Overlay measure rides the same rect. Auto-scroll is
// pointer-driven (ADR-0033), so geometry that matters is the Scrollport's rect
// vs the pointer's clientX/Y, mocked per test — not this.
const ITEM_RECT: Rect = {
  top: 0,
  left: 0,
  right: 100,
  bottom: 100,
  width: 100,
  height: 100,
}
const measure: Measure = () => ITEM_RECT

// A hand-stepped rAF queue: the auto-scroll loop reschedules itself every frame,
// so the immediate-call stub the other suites use would recurse forever. Each
// `flushFrame(t)` runs exactly the frames queued so far, at timestamp `t`.
let rafId = 0
let rafCbs = new Map<number, FrameRequestCallback>()
const flushFrame = (t: number) =>
  act(() => {
    const due = [...rafCbs.entries()]
    rafCbs = new Map()
    for (const [, cb] of due) cb(t)
  })

const press = (node: Element, at: { x: number; y: number }) =>
  fireEvent.pointerDown(node, { clientX: at.x, clientY: at.y, pointerId: 1 })
const move = (at: { x: number; y: number }) =>
  fireEvent.pointerMove(window, { clientX: at.x, clientY: at.y, pointerId: 1 })
const release = (at: { x: number; y: number }) =>
  fireEvent.pointerUp(window, { clientX: at.x, clientY: at.y, pointerId: 1 })

beforeEach(() => {
  rafId = 0
  rafCbs = new Map()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++rafId
    rafCbs.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCbs.delete(id)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// Turn a real div into a vertical Scrollport 300px tall over 1000px of content,
// sitting at viewport (0,0)–(300,300). Returns the scrollBy spy and points
// elementFromPoint / getComputedStyle at it.
const makeScrollport = (el: HTMLElement) => {
  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 300,
      bottom: 300,
      width: 300,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 300 })
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 300 })
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: 300 })
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    writable: true,
    value: 0,
  })
  Object.defineProperty(el, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: 0,
  })
  const scrollBy = vi.fn()
  el.scrollBy = scrollBy as unknown as typeof el.scrollBy

  vi.spyOn(document, 'elementFromPoint').mockReturnValue(el)
  const realGetComputedStyle = window.getComputedStyle.bind(window)
  vi.stubGlobal('getComputedStyle', (node: Element) =>
    node === el
      ? ({ overflowY: 'scroll', overflowX: 'visible' } as CSSStyleDeclaration)
      : realGetComputedStyle(node),
  )
  return scrollBy
}

describe('autoScroll — edge-proximity scrolling (ADR-0033)', () => {
  const mount = () => {
    const DA = createDropAction<Data>({ measure }).extend(autoScroll<Data>())
    let scrollport!: HTMLElement
    function Scroller() {
      return (
        <div
          ref={(node) => {
            if (node) scrollport = node
          }}
          data-testid="scroller"
        />
      )
    }
    render(
      <>
        <DA.Item id="card" data={{ label: 'Card' }}>
          card
        </DA.Item>
        <DA.Active>{(item) => <div>{item.data.label}</div>}</DA.Active>
        <Scroller />
      </>,
    )
    return { scrollBy: makeScrollport(scrollport) }
  }

  test('scrolls toward the edge while the pointer sits in the band, then stops', () => {
    const { scrollBy } = mount()

    // Start the drag and land the pointer in the bottom band (the outer 20% of a
    // 300px-tall scrollport is y > 240).
    press(screen.getByRole('button'), { x: 50, y: 50 })
    move({ x: 150, y: 280 }) // activates the drag
    // The auto-scroll listener attaches in the effect after the Overlay mounts,
    // so feed it the in-band position with a second move.
    move({ x: 150, y: 280 })

    // First frame seeds the clock (dt = 0, no scroll); the next has a real dt.
    flushFrame(16)
    expect(scrollBy).not.toHaveBeenCalled()
    flushFrame(32)

    expect(scrollBy).toHaveBeenCalled()
    const [dx, dy] = scrollBy.mock.calls.at(-1) as [number, number]
    expect(dx).toBe(0)
    expect(dy).toBeGreaterThan(0) // toward the bottom edge

    // Move out of the band (mid-scrollport): scrolling stops.
    scrollBy.mockClear()
    move({ x: 150, y: 150 })
    flushFrame(48)
    flushFrame(64)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  test('stops scrolling once the drag ends', () => {
    const { scrollBy } = mount()

    press(screen.getByRole('button'), { x: 50, y: 50 })
    move({ x: 150, y: 280 })
    move({ x: 150, y: 280 })
    flushFrame(16)
    flushFrame(32)
    expect(scrollBy).toHaveBeenCalled()

    // Release: the drag-time effect tears down its pointermove + rAF, so no
    // further frame scrolls even with the pointer left in the band.
    release({ x: 150, y: 280 })
    scrollBy.mockClear()
    flushFrame(48)
    flushFrame(64)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  test('deeper into the band scrolls faster (proportional speed)', () => {
    const { scrollBy } = mount()

    press(screen.getByRole('button'), { x: 50, y: 50 })
    // Just inside the band (y = 250, 10px deep of a 60px band).
    move({ x: 150, y: 250 })
    move({ x: 150, y: 250 })
    flushFrame(16)
    flushFrame(32)
    const shallow = (scrollBy.mock.calls.at(-1) as [number, number])[1]

    // Hard against the edge (y = 299): near max speed.
    scrollBy.mockClear()
    move({ x: 150, y: 299 })
    flushFrame(48)
    const deep = (scrollBy.mock.calls.at(-1) as [number, number])[1]

    expect(deep).toBeGreaterThan(shallow)
  })
})

describe('autoScroll — extension surface (ADR-0033)', () => {
  test('.extend(autoScroll()) injects no namespace members and does not warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const DA = createDropAction<Data>({ measure })
    const before = Object.keys(DA).length
    const extended = DA.extend(autoScroll<Data>())

    // The Extension registers a drag-time hook (ADR-0033), not a member: enabling
    // it adds no AutoScroll/useAutoScroll to the namespace.
    expect('AutoScroll' in extended).toBe(false)
    expect('useAutoScroll' in extended).toBe(false)
    expect(Object.keys(extended).length).toBe(before)
    // No override collision warning (it returns no members).
    expect(warn).not.toHaveBeenCalled()
  })
})
