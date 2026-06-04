import type { CollisionDetection } from './collision'
import type {
  DropActionState,
  ItemRegistration,
  ZoneRegistration,
} from './types.private'
import type {
  DraggedItem,
  Measure,
  Modifier,
  Rect,
  Respond,
  Transform,
} from './types.public'

type EngineDeps<Data> = {
  items: Map<string, ItemRegistration<Data>>
  zones: Map<string, ZoneRegistration<Data>>
  measure: Measure
  modifiers: Modifier[]
  collisionDetection: CollisionDetection
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
export function createEngine<Data>({
  items,
  zones,
  measure,
  modifiers,
  collisionDetection,
  setState,
  reset,
}: EngineDeps<Data>) {
  const startDrag = (id: string, event: PointerEvent) => {
    const item = items.get(id)
    if (!item) return

    const originRect = measure({ node: item.node, id, type: 'item' })
    // Snapshot every Zone rect once at drag start; collisions recompute
    // against this snapshot each frame (ADR-0006).
    const zoneRects = [...zones.entries()].map(([zoneId, zone]) => ({
      id: zoneId,
      rect: measure({ node: zone.node, id: zoneId, type: 'zone' }),
    }))

    const startX = event.clientX
    const startY = event.clientY

    // Route subsequent pointer events to the captured element so the drag
    // survives the pointer leaving the handle. Best-effort: not every
    // environment implements pointer capture.
    try {
      item.node.setPointerCapture(event.pointerId)
    } catch {}

    let latestX = startX
    let latestY = startY
    let frame: number | null = null

    // Run the modifier pipeline left-to-right, each modifier feeding the
    // next, starting from the raw pointer delta (ADR-0007). The result is
    // the Overlay transform — used for BOTH the published transform and the
    // rect collision tests against, so Over always matches the visibly
    // constrained Overlay. Window dims are read here and injected so the
    // built-ins stay pure.
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
    // pointer (ADR-0007), so a constrained Overlay only registers Over where
    // it can visually reach. The configured detector also gets the live
    // pointer (needed by `pointerWithin`) — ADR-0006.
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
      })
    }

    publish(startX, startY, 'dragging')

    const flush = () => {
      frame = null
      publish(latestX, latestY, 'dragging')
    }

    const onMove = (e: PointerEvent) => {
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
      cleanup()

      // Resolve against the final pointer position, regardless of whether a
      // throttled frame had a chance to fire. The same post-modifier
      // transform that drives the Overlay drives this resolution.
      const transform = resolveTransform(e.clientX, e.clientY)
      const overId = overAt(e.clientX, e.clientY, transform)
      const dragged: DraggedItem<Data> = { id, data: item.dataRef.current }

      // Released over nothing — an immediate Reject, no Dropping phase.
      if (overId === null) {
        reset()
        return
      }

      // Enter the Dropping phase: the Overlay persists (status 'dropping',
      // origin rect and over kept) across the async gap between release and
      // resolution (ADR-0004). Collision is frozen at the release position.
      publish(e.clientX, e.clientY, 'dropping')

      const zone = zones.get(overId)

      // The Zone decides; the Item reacts (ADR-0003). respond('accepted') is
      // the only path that runs onAccept; anything else, including never
      // responding, is a Reject. Resolution acts once (idempotent-safe).
      let settled = false
      const finish = (accepted: boolean) => {
        if (settled) return
        settled = true
        if (accepted) item.onAcceptRef.current?.(dragged)
        reset()
      }

      const respond: Respond = (status) => {
        if (status === 'accepted') finish(true)
      }

      // onDrop may resolve synchronously, await before calling respond, or
      // return a Promise. Await its settlement too: if the handler completes
      // without an accept, that is a Reject — so the Overlay never sticks. A
      // synchronous respond('accepted') has already settled by then, leaving
      // the trailing reject a no-op.
      const result = zone?.onDropRef.current(dragged, respond) as
        | undefined
        | PromiseLike<unknown>
      Promise.resolve(result).then(
        () => finish(false),
        () => finish(false),
      )
    }

    // Esc or pointercancel abort an in-flight drag with no Drop: onDrop and
    // onAccept never run, and the store resets.
    const onCancel = () => {
      cleanup()
      reset()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKeyDown)
  }

  return { startDrag }
}
