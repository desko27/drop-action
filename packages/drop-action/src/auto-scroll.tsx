import { useEffect } from 'react'
import type { ActiveSnapshot } from './main'

// drop-action/auto-scroll — the opt-in edge-proximity auto-scroll (CONTEXT.md —
// Auto-scroll): the dnd-kit-style behaviour where, while a drag's pointer sits
// within a band near a Scrollport's edge, that scrollport scrolls continuously,
// faster the deeper into the band — innermost first, the window as the outermost.
//
// It ships as an Extension (ADR-0033) that adds NO namespace members and that the
// consumer mounts nothing for: `.extend(autoScroll())` is its whole surface. It
// registers one drag-time hook into the channel's slot (ADR-0033), which
// `useOverlay` (hence `<Active>`) runs each render while a drag is live. The hook
// gates on `useActive`, then — only during a drag — adds its OWN `pointermove`
// (the store withholds the per-frame pointer, ADR-0018) and a self-sustaining rAF
// that keeps scrolling even while the pointer is held still near an edge (the
// same reason Dwell could not ride the movement-driven loop, ADR-0024).
//
// It needs none of the core's measurement apparatus: scrolling fires `scroll`,
// which the core already turns into its settling burst (ADR-0026), so the Over
// Zone tracks the moving list for free. Scrollport discovery is this module's own
// small overflow-ancestor walk (the shape of `resolveClippers`, ADR-0023), so the
// core exports nothing for it. Import is DOM-free — `document`/`window` are
// touched only inside the drag-time effect — so SSR stays safe.

const DEFAULT_THRESHOLD = 0.2
const DEFAULT_SPEED = 1500
const DEFAULT_ACCELERATION = 1

export type AutoScrollOptions = {
  // Edge band size as a fraction of the Scrollport per axis. At 0.2 the outer
  // 20% of each edge is the acceleration zone. Default 0.2.
  threshold?: number
  // Maximum scroll speed in CSS px per second, reached hard against the edge.
  // Default 1500.
  speed?: number
  // Exponent mapping band depth (0 at the band's inner edge, 1 at the Scrollport
  // edge) to speed: 1 is linear, >1 eases in (gentler until close to the edge).
  // Default 1.
  acceleration?: number
}

// The slice of the channel Auto-scroll reads: `useActive` to gate on a live drag,
// and the drag-time hook seam to register its loop (ADR-0033). The channel is
// typed `unknown` (ADR-0025), so the Extension narrows it to just this.
type AutoScrollChannel<Data> = {
  useActive: () => ActiveSnapshot<Data> | null
  registerOverlayHook: (useDragTimeHook: () => void) => void
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

// A viewport-space box plus the predicates and mover for one Scrollport — the
// element scrollports and the window share this shape so the resolution below
// treats them alike.
type ScrollTarget = {
  rect: { left: number; top: number; right: number; bottom: number }
  width: number
  height: number
  // Can this target still scroll `dir` (-1 toward start, +1 toward end) per axis?
  canX: (dir: number) => boolean
  canY: (dir: number) => boolean
  scroll: (dx: number, dy: number) => void
}

export function autoScroll<Data = unknown>(options: AutoScrollOptions = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD
  const speed = options.speed ?? DEFAULT_SPEED
  const acceleration = options.acceleration ?? DEFAULT_ACCELERATION

  // The per-axis scroll delta (px this frame) for a pointer coord `p` inside a
  // Scrollport spanning [min, max] of `size`, over a frame of `dt` seconds.
  // Negative scrolls toward the start (up/left), positive toward the end; zero
  // outside the edge bands. Scaled by `dt` so the speed is frame-rate-independent.
  const axisDelta = (
    p: number,
    min: number,
    max: number,
    size: number,
    dt: number,
  ): number => {
    const band = threshold * size
    if (band <= 0) return 0
    const fromStart = p - min
    const fromEnd = max - p
    if (fromStart < band) {
      const depth = clamp01((band - fromStart) / band)
      return -speed * depth ** acceleration * dt
    }
    if (fromEnd < band) {
      const depth = clamp01((band - fromEnd) / band)
      return speed * depth ** acceleration * dt
    }
    return 0
  }

  // An `overflow: scroll/auto` ancestor that actually overflows is a Scrollport
  // (CONTEXT.md). The walk starts at the element under the pointer (the Overlay
  // is `pointer-events: none`, ADR-0010, so it is transparent to the hit-test)
  // and climbs to the root, innermost first. The window is appended as the
  // always-present outermost Scrollport.
  const targetsAt = (x: number, y: number): ScrollTarget[] => {
    const targets: ScrollTarget[] = []
    for (let el = document.elementFromPoint(x, y); el; el = el.parentElement) {
      const node = el
      const s = getComputedStyle(node)
      const scrollableY =
        (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
        node.scrollHeight > node.clientHeight
      const scrollableX =
        (s.overflowX === 'auto' || s.overflowX === 'scroll') &&
        node.scrollWidth > node.clientWidth
      if (!scrollableY && !scrollableX) continue
      const r = node.getBoundingClientRect()
      targets.push({
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        width: r.width,
        height: r.height,
        canX: (dir) =>
          dir < 0
            ? node.scrollLeft > 0
            : node.scrollLeft < node.scrollWidth - node.clientWidth,
        canY: (dir) =>
          dir < 0
            ? node.scrollTop > 0
            : node.scrollTop < node.scrollHeight - node.clientHeight,
        scroll: (dx, dy) => node.scrollBy(dx, dy),
      })
    }
    const root = document.documentElement
    targets.push({
      rect: {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      },
      width: window.innerWidth,
      height: window.innerHeight,
      canX: (dir) =>
        dir < 0
          ? window.scrollX > 0
          : window.scrollX < root.scrollWidth - root.clientWidth,
      canY: (dir) =>
        dir < 0
          ? window.scrollY > 0
          : window.scrollY < root.scrollHeight - root.clientHeight,
      scroll: (dx, dy) => window.scrollBy(dx, dy),
    })
    return targets
  }

  // One frame of scrolling for a pointer at (px, py). Each axis is resolved
  // against the innermost Scrollport whose band the pointer is in AND which can
  // still scroll that way; an inner one at its limit falls through to the next
  // outer (finally the window) — CONTEXT.md — Scrollport.
  const tick = (px: number, py: number, dt: number) => {
    let doneX = false
    let doneY = false
    for (const t of targetsAt(px, py)) {
      if (doneX && doneY) break
      const { rect } = t
      // The pointer must be within this Scrollport for its edges to pull.
      if (
        px < rect.left ||
        px > rect.right ||
        py < rect.top ||
        py > rect.bottom
      )
        continue
      let dx = 0
      let dy = 0
      if (!doneX) {
        const v = axisDelta(px, rect.left, rect.right, t.width, dt)
        if (v !== 0 && t.canX(Math.sign(v))) {
          dx = v
          doneX = true
        }
      }
      if (!doneY) {
        const v = axisDelta(py, rect.top, rect.bottom, t.height, dt)
        if (v !== 0 && t.canY(Math.sign(v))) {
          dy = v
          doneY = true
        }
      }
      if (dx !== 0 || dy !== 0) t.scroll(dx, dy)
    }
  }

  // The Extension (ADR-0025 / ADR-0033): register the drag-time hook, add no
  // members. Enabling Auto-scroll is `.extend(autoScroll())` and nothing else.
  return (channel: unknown) => {
    const { useActive, registerOverlayHook } =
      channel as AutoScrollChannel<Data>

    // The drag-time hook the Overlay runs each render (ADR-0033). It tracks the
    // pointer and runs the scroll loop only while a drag is live; between drags
    // `active` is null and the effect has torn everything down.
    const useAutoScroll = () => {
      const active = useActive()
      const dragging = active !== null && active.status === 'dragging'

      useEffect(() => {
        if (!dragging) return

        let px = 0
        let py = 0
        let seen = false
        let last = 0
        let raf = 0

        const onMove = (e: PointerEvent) => {
          px = e.clientX
          py = e.clientY
          seen = true
        }

        // A self-sustaining loop (not movement-driven): it keeps scrolling while
        // the pointer is held still in a band, re-reading the last pointer
        // position each frame, until the drag ends (CONTEXT.md — Auto-scroll).
        const step = (now: number) => {
          const dt = last ? (now - last) / 1000 : 0
          last = now
          if (seen && dt > 0) tick(px, py, dt)
          raf = requestAnimationFrame(step)
        }

        window.addEventListener('pointermove', onMove)
        raf = requestAnimationFrame(step)

        return () => {
          window.removeEventListener('pointermove', onMove)
          cancelAnimationFrame(raf)
        }
      }, [dragging])
    }

    registerOverlayHook(useAutoScroll)
    return {}
  }
}
