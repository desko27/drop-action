import {
  evaluateActivation,
  pointerKindOf,
  resolveActivationConstraint,
} from './activation'
import type { CollisionDetection } from './collision'
import type {
  DropActionState,
  DropListener,
  ItemRegistration,
  ZoneRegistration,
} from './types.private'
import type {
  ActivationConstraint,
  DraggedItem,
  DropOutcome,
  Measure,
  Modifier,
  Rect,
  Respond,
  Transform,
} from './types.public'

type EngineDeps<Data> = {
  items: Map<string, ItemRegistration<Data>>
  zones: Map<string, ZoneRegistration>
  // Drop handlers subscribe per zoneId, independent of node registration
  // (issue #9): a Drop fires every listener registered for the Over zone.
  dropListeners: Map<string, Set<DropListener<Data>>>
  measure: Measure
  modifiers: Modifier[]
  collisionDetection: CollisionDetection
  activationConstraint?: ActivationConstraint
  setState: (state: DropActionState<Data>) => void
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
  dropListeners,
  measure,
  modifiers,
  collisionDetection,
  activationConstraint,
  setState,
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

      // Run the modifier pipeline left-to-right, each modifier feeding the
      // next, starting from the raw pointer delta (ADR-0007). The delta is
      // measured from the original press, so the Overlay does not jump on
      // activation. The result is the Overlay transform — used for BOTH the
      // published transform and the rect collision tests against, so Over
      // always matches the visibly constrained Overlay. Window dims are read
      // here and injected so the built-ins stay pure.
      const resolveTransform = (px: number, py: number): Transform => {
        const pointer = { x: px, y: py }
        let transform: Transform = { x: px - startX, y: py - startY }
        for (const modifier of modifiers) {
          transform = modifier({
            transform,
            originRect,
            pointer,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
          })
        }
        return transform
      }

      // Collision runs against the post-modifier Overlay rect, not the raw
      // pointer (ADR-0007), so a constrained Overlay only registers Over
      // where it can visually reach. The configured detector also gets the
      // live pointer (needed by `pointerWithin`) — ADR-0006.
      const overAt = (px: number, py: number, transform: Transform) =>
        collisionDetection({
          pointer: { x: px, y: py },
          overlayRect: translate(originRect, transform.x, transform.y),
          zones: zoneRects,
        })

      const publish = (
        px: number,
        py: number,
        status: 'dragging' | 'dropping',
      ) => {
        const transform = resolveTransform(px, py)
        setState({
          active: {
            id,
            data: item.dataRef.current,
            status,
            originRect,
            transform,
          },
          over: overAt(px, py, transform),
          // No resolution while a drag is live; publishing 'dragging' at the
          // next drag's start is also what clears the prior resolution.
          resolution: null,
        })
      }

      // End the drag on a terminal outcome (ADR-0013): clear Active and Over
      // and publish the resolution in the SAME emit, so one render sees
      // `active === null` alongside the outcome. The resolution then lingers
      // until the next drag's first `publish` overwrites it.
      const resolve = (outcome: DropOutcome, transform: Transform) => {
        setState({
          active: null,
          over: null,
          resolution: {
            outcome,
            originRect,
            transform,
            item: { id, data: item.dataRef.current },
          },
        })
      }

      publish(activateX, activateY, 'dragging')

      const flush = () => {
        frame = null
        publish(latestX, latestY, 'dragging')
      }

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        // The drag now owns the gesture: keep the browser from scrolling or
        // selecting under it (ADR-0012).
        e.preventDefault()
        latestX = e.clientX
        latestY = e.clientY
        // Throttle to one update per animation frame.
        if (frame === null) frame = requestAnimationFrame(flush)
      }

      // Tear down every listener and any pending frame. Called on every exit
      // path — resolution and cancellation alike — so nothing leaks.
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('keydown', onKeyDown)
        if (frame !== null) cancelAnimationFrame(frame)
      }

      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        cleanup()

        // Resolve against the final pointer position, regardless of whether a
        // throttled frame had a chance to fire. The same post-modifier
        // transform that drives the Overlay drives this resolution.
        const transform = resolveTransform(e.clientX, e.clientY)
        const overId = overAt(e.clientX, e.clientY, transform)
        const dragged: DraggedItem<Data> = { id, data: item.dataRef.current }

        // Released over nothing — a No-drop (CONTEXT.md): no Zone, so no Drop
        // and no Dropping phase. It is a Return, not a Reject.
        if (overId === null) {
          resolve('no-drop', transform)
          return
        }

        // Enter the Dropping phase: the Overlay persists (status 'dropping',
        // origin rect and over kept) across the async gap between release and
        // resolution (ADR-0004). Collision is frozen at the release position.
        publish(e.clientX, e.clientY, 'dropping')

        // The Zone decides; the Item reacts (ADR-0003). respond('accepted')
        // is the only path that runs onAccept; anything else, including never
        // responding, is a Reject. Resolution acts once (idempotent-safe), so
        // with several listeners on one Over Zone the first 'accepted' wins.
        let settled = false
        const finish = (accepted: boolean) => {
          if (settled) return
          settled = true
          if (accepted) item.onAcceptRef.current?.(dragged)
          resolve(accepted ? 'accepted' : 'rejected', transform)
        }

        const respond: Respond = (status) => {
          if (status === 'accepted') finish(true)
        }

        // Fire every handler registered for the Over zoneId — a Zone's own
        // onDrop and any remote `useDropEvent` listeners alike (issue #9).
        // Snapshot first so a handler that unsubscribes mid-Drop is safe. Each
        // may respond synchronously, await before responding, or return a
        // Promise; once all have settled without an accept, that is a Reject,
        // so the Overlay never sticks.
        const listeners = dropListeners.get(overId)
        const results = listeners
          ? [...listeners].map((listener) => listener.current(dragged, respond))
          : []
        Promise.allSettled(results.map((r) => Promise.resolve(r))).then(() =>
          finish(false),
        )
      }

      // Esc or pointercancel abort an in-flight drag: a Cancel (CONTEXT.md).
      // No Drop, so onDrop and onAccept never run; we publish a 'cancelled'
      // resolution from wherever the Overlay currently is and clear Active.
      const onCancel = (e?: PointerEvent) => {
        if (e && e.pointerId !== pointerId) return
        cleanup()
        resolve('cancelled', resolveTransform(latestX, latestY))
      }

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      window.addEventListener('keydown', onKeyDown)
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
