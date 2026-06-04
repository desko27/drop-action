import { rectIntersection } from './collision'
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
  Transform,
} from './types.public'

type EngineDeps<Data> = {
  items: Map<string, ItemRegistration<Data>>
  zones: Map<string, ZoneRegistration<Data>>
  measure: Measure
  modifiers: Modifier[]
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

    const overAt = (transform: Transform): string | null => {
      const overlayRect = translate(originRect, transform.x, transform.y)
      return rectIntersection({ overlayRect, zones: zoneRects })
    }

    const publish = (px: number, py: number) => {
      const transform = resolveTransform(px, py)
      setState({
        active: {
          id,
          data: item.dataRef.current,
          status: 'dragging',
          originRect,
          transform,
        },
        over: overAt(transform),
      })
    }

    publish(startX, startY)

    const flush = () => {
      frame = null
      publish(latestX, latestY)
    }

    const onMove = (e: PointerEvent) => {
      latestX = e.clientX
      latestY = e.clientY
      // Throttle to one update per animation frame.
      if (frame === null) frame = requestAnimationFrame(flush)
    }

    const onUp = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (frame !== null) cancelAnimationFrame(frame)

      // Resolve against the final pointer position, regardless of whether a
      // throttled frame had a chance to fire. The same post-modifier
      // transform that drives the Overlay drives this resolution.
      const overId = overAt(resolveTransform(e.clientX, e.clientY))
      const dragged: DraggedItem<Data> = { id, data: item.dataRef.current }

      if (overId !== null) {
        const zone = zones.get(overId)
        // The Zone decides; the Item reacts (ADR-0003). respond('accepted')
        // is the only path that runs onAccept — never responding rejects.
        const respond = (status: 'accepted') => {
          if (status === 'accepted') item.onAcceptRef.current?.(dragged)
        }
        zone?.onDropRef.current(dragged, respond)
      }

      reset()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return { startDrag }
}
