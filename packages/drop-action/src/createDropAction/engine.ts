import {
  evaluateActivation,
  pointerKindOf,
  resolveActivationConstraint,
} from './activation'
import { rectIntersection } from './collision'
import type {
  DropActionState,
  ItemRegistration,
  ZoneRegistration,
} from './types.private'
import type {
  ActivationConstraint,
  DraggedItem,
  Measure,
  Rect,
} from './types.public'

type EngineDeps<Data> = {
  items: Map<string, ItemRegistration<Data>>
  zones: Map<string, ZoneRegistration<Data>>
  measure: Measure
  activationConstraint?: ActivationConstraint
  setState: (state: DropActionState<Data>) => void
  reset: () => void
}

const translate = (rect: Rect, x: number, y: number): Rect => ({
  top: rect.top + y,
  bottom: rect.bottom + y,
  left: rect.left + x,
  right: rect.right + x,
  width: rect.width,
  height: rect.height,
})

// The custom Pointer Events engine (ADR-0001). A single unified stream —
// pointerdown (here, via the handle) → pointermove with setPointerCapture
// → pointerup — throttled to animation frames.
//
// A press does not become a drag immediately (ADR-0012). pointerdown opens
// a *pending activation* phase that watches movement (and, for touch, a
// hold timer) through the pure `evaluateActivation`. Only once the
// constraint is crossed do we measure, capture the pointer, and publish the
// Active state — the real drag below begins from the original press point.
// During the pending phase we never preventDefault and never set
// `touch-action: none`, so a quick touch swipe is left to the browser to
// scroll; `touch-action: none` is applied (in index.tsx, keyed off the
// Active state) only once a drag is truly under way.
export function createEngine<Data>({
  items,
  zones,
  measure,
  activationConstraint,
  setState,
  reset,
}: EngineDeps<Data>) {
  const constraint = resolveActivationConstraint(activationConstraint)

  const startDrag = (id: string, event: PointerEvent) => {
    const item = items.get(id)
    if (!item) return

    const kind = pointerKindOf(event.pointerType)
    const startX = event.clientX
    const startY = event.clientY
    const startTime = performance.now()
    const pointerId = event.pointerId

    let delayTimer: ReturnType<typeof setTimeout> | null = null

    // ----- The real drag (after activation) -----------------------------

    const beginDrag = (activateX: number, activateY: number) => {
      const originRect = measure({ node: item.node, id, type: 'item' })
      // Snapshot every Zone rect once at drag start; collisions recompute
      // against this snapshot each frame (ADR-0006).
      const zoneRects = [...zones.entries()].map(([zoneId, zone]) => ({
        id: zoneId,
        rect: measure({ node: zone.node, id: zoneId, type: 'zone' }),
      }))

      // Route subsequent pointer events to the captured element so the drag
      // survives the pointer leaving the handle. Best-effort: not every
      // environment implements pointer capture.
      try {
        item.node.setPointerCapture(pointerId)
      } catch {}

      let latestX = activateX
      let latestY = activateY
      let frame: number | null = null

      const overAt = (px: number, py: number): string | null => {
        // Collision runs against the post-modifier Overlay rect, not the raw
        // pointer (ADR-0007). The skeleton ships no modifiers, so the Overlay
        // is the origin rect shifted by the raw pointer delta. The delta is
        // measured from the original press, so the Overlay does not jump on
        // activation.
        const overlayRect = translate(originRect, px - startX, py - startY)
        return rectIntersection({ overlayRect, zones: zoneRects })
      }

      const publish = (px: number, py: number) => {
        setState({
          active: {
            id,
            data: item.dataRef.current,
            status: 'dragging',
            originRect,
            transform: { x: px - startX, y: py - startY },
          },
          over: overAt(px, py),
        })
      }

      publish(activateX, activateY)

      const flush = () => {
        frame = null
        publish(latestX, latestY)
      }

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        // The drag now owns the gesture: keep the browser from scrolling or
        // selecting under it (ADR-0012). `touch-action: none` is applied in
        // parallel via the Active state for browsers that need it ahead of
        // the move.
        e.preventDefault()
        latestX = e.clientX
        latestY = e.clientY
        // Throttle to one update per animation frame.
        if (frame === null) frame = requestAnimationFrame(flush)
      }

      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        if (frame !== null) cancelAnimationFrame(frame)

        // Resolve against the final pointer position, regardless of whether a
        // throttled frame had a chance to fire.
        const overId = overAt(e.clientX, e.clientY)
        const dragged: DraggedItem<Data> = { id, data: item.dataRef.current }

        if (overId !== null) {
          const zone = zones.get(overId)
          // The Zone decides; the Item reacts (ADR-0003).
          // respond('accepted') is the only path that runs onAccept — never
          // responding rejects.
          const respond = (status: 'accepted') => {
            if (status === 'accepted') item.onAcceptRef.current?.(dragged)
          }
          zone?.onDropRef.current(dragged, respond)
        }

        reset()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }

    // ----- Pending activation phase (no drag yet) -----------------------

    const endPending = () => {
      if (delayTimer !== null) clearTimeout(delayTimer)
      window.removeEventListener('pointermove', onPendingMove)
      window.removeEventListener('pointerup', onPendingEnd)
      window.removeEventListener('pointercancel', onPendingEnd)
    }

    const onPendingMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      const decision = evaluateActivation({
        kind,
        dx: e.clientX - startX,
        dy: e.clientY - startY,
        elapsed: performance.now() - startTime,
        constraint,
      })
      if (decision === 'pending') return
      // Either way the pending phase is over.
      endPending()
      // 'cancel' (a touch swipe beyond tolerance before the delay) abandons
      // activation: we never preventDefault, so the browser keeps scrolling.
      if (decision === 'activate') beginDrag(e.clientX, e.clientY)
    }

    const onPendingEnd = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      // Released (or cancelled) before activation — it was a click/tap.
      endPending()
    }

    window.addEventListener('pointermove', onPendingMove)
    window.addEventListener('pointerup', onPendingEnd)
    window.addEventListener('pointercancel', onPendingEnd)

    // Touch activates by holding past the delay within tolerance. Movement
    // is still watched by onPendingMove (which cancels on a swipe); this
    // timer fires when the hold completes in place.
    if (kind === 'touch') {
      delayTimer = setTimeout(() => {
        delayTimer = null
        endPending()
        beginDrag(startX, startY)
      }, constraint.touch.delay)
    }
  }

  return { startDrag }
}
