import {
  evaluateActivation,
  pointerKindOf,
  resolveActivationConstraint,
} from './activation'
import { clipToVisible, resolveClippers } from './clip'
import {
  type CollisionDetection,
  pointerWithin,
  type ZoneRect,
} from './collision'
import type {
  ActiveSnapshot,
  HoverRegistration,
  ItemRegistration,
  OverlayRegistry,
  Resolution,
  ZoneRegistration,
} from './types.private'
import type {
  ActivationConstraint,
  DraggedItem,
  DropOutcome,
  DropVerdict,
  GrabAnchor,
  GrabAnchorPoint,
  Measure,
  Modifier,
  Rect,
  ShouldStart,
  Transform,
} from './types.public'

type Commit<Data> = (next: {
  active?: ActiveSnapshot<Data> | null
  over?: string | null
  hover?: string | null
  resolution?: Resolution<Data> | null
}) => void

type EngineDeps<Data, Accept, Reject> = {
  items: Map<string, ItemRegistration<Data, Accept, Reject>>
  // A Zone carries its single onDrop with its node (ADR-0014): a Drop fires
  // the one handler registered for the Over Zone, if any.
  zones: Map<string, ZoneRegistration<Data, Accept, Reject>>
  // Hover targets (ADR-0024): observe-only, in their own registry so they
  // never affect Drop resolution. Each carries an optional dwell config.
  hovers: Map<string, HoverRegistration<Data>>
  measure: Measure
  modifiers: Modifier[]
  collisionDetection: CollisionDetection
  activationConstraint?: ActivationConstraint
  // The Activation guard (ADR-0016): resolved (default or custom) in the
  // factory; vetoes ineligible presses before the pending phase.
  shouldStart: ShouldStart
  // Whether to show the global grabbing cursor while a drag is live (ADR-0019).
  grabCursor: boolean
  // The Drop Action's grab anchor (ADR-0021): where the travelling Overlay
  // hangs from the pointer. An Item may override it; defaults to 'proportional'.
  grabAnchor?: GrabAnchor
  // The shared handle on the rendered Overlay node (ADR-0017, ADR-0018).
  overlay: OverlayRegistry
  // The store's only writer (ADR-0018): emits a transition, never per frame.
  commit: Commit<Data>
}

// The global grabbing cursor (ADR-0019). While a drag is live the pointer is
// captured and roams the page, so a handle-local cursor is not enough — only a
// document-wide rule shows `grabbing` everywhere without flickering to whatever
// is under the pointer. We inject one shared `<style>` by id (idempotent), so a
// drag shows it and ends remove it. Touches `document` only when a drag is
// actually under way, so import and SSR stay DOM-free. Concurrent drags can only
// happen across separate Drop Actions (each closure-isolated, ADR-0002;
// multi-pointer within one action is out of scope, ADR-0021); they share the one
// node, and the first to
// end clears it — a purely cosmetic edge we accept for a tiny, self-healing
// implementation (the next completed drag re-adds and clears it cleanly).
const GRABBING_STYLE_ID = 'drop-action-grabbing-cursor'

// A throwaway rect for the Hover pass (ADR-0024). `pointerWithin` ignores its
// `overlayRect` (it tests the pointer against the target rects), so the Hover
// hit-test reuses that detector with this zero rect rather than computing an
// Overlay rect it would discard. Frozen so the pass allocates nothing.
const ZERO_RECT: Rect = {
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
}

const showGrabbingCursor = () => {
  if (document.getElementById(GRABBING_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = GRABBING_STYLE_ID
  style.textContent = '*{cursor:grabbing!important}'
  document.head.appendChild(style)
}

const hideGrabbingCursor = () => {
  document.getElementById(GRABBING_STYLE_ID)?.remove()
}

// The custom Pointer Events engine (ADR-0001). A single unified stream —
// pointerdown (here, via the handle) → pointermove with setPointerCapture
// → pointerup — throttled to animation frames.
//
// A press does not become a drag immediately. First it must clear the
// Activation guard (ADR-0016) — an origin veto — then cross the Activation
// constraint (ADR-0012). pointerdown opens a *pending activation* phase that
// watches movement (and, for touch, a hold timer) through the pure
// `evaluateActivation`. Only once the constraint is crossed do we measure,
// capture the pointer, and publish the Active state. During the pending phase
// we never preventDefault and never set `touch-action: none`, so a quick touch
// swipe is left to the browser to scroll; `touch-action: none` is applied (in
// index.tsx, keyed off the Active state) only once a drag is truly under way.
export function createEngine<Data, Accept, Reject>({
  items,
  zones,
  hovers,
  measure,
  modifiers,
  collisionDetection,
  activationConstraint,
  shouldStart,
  grabCursor,
  grabAnchor,
  overlay,
  commit,
}: EngineDeps<Data, Accept, Reject>) {
  const constraint = resolveActivationConstraint(activationConstraint)

  // One Active per Drop Action (ADR-0021): a single in-flight flag, per engine
  // (= per Drop Action), gates startDrag. It blocks a second concurrent drag —
  // a second pointer (multi-pointer drag is out of scope) and the bubbled
  // double-start of a default Item that wraps a useDragHandle (the inner trigger
  // plus the bubbled wrapper trigger both fire startDrag for one press). Set when
  // a press enters the pending phase; cleared when that press is abandoned before
  // activation, or when a live drag reaches a terminal outcome. Concurrency
  // across separate Drop Actions is untouched — each has its own engine and flag.
  let dragInFlight = false

  const startDrag = (id: string, event: PointerEvent) => {
    // Activation guard (ADR-0016): an ineligible press (interactive origin,
    // non-primary button) never enters the pending phase — and, since we never
    // preventDefault, the browser handles the click/checkbox normally.
    if (!shouldStart(event)) return

    // One Active per Drop Action (ADR-0021): ignore a press while a drag is
    // already pending or live in this Drop Action.
    if (dragInFlight) return

    const item = items.get(id)
    if (!item) return

    dragInFlight = true

    const kind = pointerKindOf(event.pointerType)
    const startX = event.clientX
    const startY = event.clientY
    const startTime = performance.now()
    const pointerId = event.pointerId

    let delayTimer: ReturnType<typeof setTimeout> | null = null

    // ----- The real drag (after activation) -----------------------------

    const beginDrag = (activateX: number, activateY: number) => {
      // Frozen at drag start: the source's origin rect, plus the resolved grab
      // anchor (ADR-0021): per-Item override, else the Drop Action's, else
      // 'proportional'. The Overlay is position:fixed and tracks the pointer
      // regardless of scroll, hanging from the anchor (see resolveAnchoredOrigin).
      const originRect = measure({ node: item.node, id, type: 'item' })
      const anchor: GrabAnchor =
        item.grabAnchorRef.current ?? grabAnchor ?? 'proportional'

      // Each Zone's clipping-ancestor chain, resolved once on first measure and
      // cached for the drag (ADR-0023): the chain needs `getComputedStyle`, but
      // only the ancestors' positions — not the DOM shape — change on scroll, so
      // re-measures below just re-read their boxes. Covers every Zone, including
      // ones that start fully clipped, so they can re-enter when scrolled in.
      const zoneClippers = new Map<string, Element[]>()
      const hoverClippers = new Map<string, Element[]>()
      const measureClipped = <R extends { node: HTMLElement }>(
        registry: Map<string, R>,
        clippers: Map<string, Element[]>,
        type: 'zone' | 'hover',
      ): ZoneRect[] => {
        const rects: ZoneRect[] = []
        for (const [rid, reg] of registry) {
          let chain = clippers.get(rid)
          if (!chain) {
            chain = resolveClippers(reg.node)
            clippers.set(rid, chain)
          }
          // Clip the raw rect to the visible region (ADR-0023): only the part
          // not scrolled out behind an overflow ancestor can be Over (a Zone)
          // or Hovered (a Hover target). A node clipped to nothing drops out of
          // the snapshot entirely — the exclusion is re-applied every measure,
          // so one scrolled back into view re-enters and becomes eligible again.
          const raw = measure({ node: reg.node, id: rid, type })
          const rect = clipToVisible(raw, chain)
          if (rect) rects.push({ id: rid, rect })
        }
        return rects
      }
      const measureZones = () => measureClipped(zones, zoneClippers, 'zone')
      const measureHovers = () => measureClipped(hovers, hoverClippers, 'hover')

      // Zone rects are re-measured during the drag (ADR-0017), so this is a
      // mutable snapshot, refreshed on scroll/resize below. Hover-target rects
      // (ADR-0024) ride the same refresh.
      let zoneRects = measureZones()
      let hoverRects = measureHovers()
      // The Overlay's own size, measured once when its node is first available
      // (ADR-0017); until then, fall back to the source size.
      let overlaySize: { width: number; height: number } | null = null
      let latestX = activateX
      let latestY = activateY
      let transform: Transform = { x: 0, y: 0 }
      let over: string | null = null
      // The current Hover target and its dwell clock (ADR-0024). `dwellAnchor`
      // is the settle point the timer is measured from; movement past the
      // target's `tolerance` re-anchors and reschedules it.
      let hover: string | null = null
      let dwellTimer: ReturnType<typeof setTimeout> | null = null
      let dwellAnchorX = activateX
      let dwellAnchorY = activateY
      let frame: number | null = null
      let remeasureFrame: number | null = null

      // Route subsequent pointer events to the captured element so the drag
      // survives the pointer leaving the handle. Best-effort: not every
      // environment implements pointer capture.
      try {
        item.node.setPointerCapture(pointerId)
      } catch {}

      // Resolve the Overlay's own size: measure once when its node is first
      // available (ADR-0017), cache it for the gesture, fall back to the source
      // size until then. Shared by the modifier pipeline (which clamps the
      // resting Overlay rect) and collision (which tests the positioned one),
      // so the two never disagree on how big the Overlay is.
      const resolveOverlaySize = (): { width: number; height: number } => {
        if (!overlaySize && overlay.node) {
          const r = measure({ node: overlay.node, id, type: 'overlay' })
          overlaySize = { width: r.width, height: r.height }
        }
        return {
          width: overlaySize ? overlaySize.width : originRect.width,
          height: overlaySize ? overlaySize.height : originRect.height,
        }
      }

      // The Overlay's anchored origin (ADR-0021): the top-left it rests at
      // (transform 0) so the resolved grab anchor sits under the press point —
      // `grab - anchorOffset`. It replaces the source top-left as the origin
      // every Overlay-positioning path reads, so render, collision and the
      // modifier clamp all track the anchored Overlay. Recomputed only while the
      // Overlay is unmeasured (the source-size fallback frame), then frozen once
      // measured — so a user `grabAnchor` function is not called per frame (the
      // engine measures the Overlay once, ADR-0017). With 'proportional' and an
      // Overlay matching the source this equals the source top-left, so
      // positioning is unchanged.
      let anchoredOrigin: { left: number; top: number } | null = null
      const resolveAnchoredOrigin = (): { left: number; top: number } => {
        if (anchoredOrigin && overlaySize) return anchoredOrigin
        const size = resolveOverlaySize()
        // The source-absolute offset (what 'preserve' keeps) — also the
        // numerator for the 'proportional' fraction.
        let ox = startX - originRect.left
        let oy = startY - originRect.top
        if (anchor !== 'preserve') {
          const frac: GrabAnchorPoint =
            anchor === 'proportional'
              ? {
                  x: originRect.width ? ox / originRect.width : 0.5,
                  y: originRect.height ? oy / originRect.height : 0.5,
                }
              : typeof anchor === 'function'
                ? anchor({
                    originRect,
                    overlaySize: size,
                    grab: { x: startX, y: startY },
                  })
                : anchor
          ox = frac.x * size.width
          oy = frac.y * size.height
        }
        anchoredOrigin = { left: startX - ox, top: startY - oy }
        return anchoredOrigin
      }

      // Run the modifier pipeline left-to-right, each modifier feeding the
      // next, starting from the raw pointer delta (ADR-0007). The delta is
      // measured from the original press, so the Overlay does not jump on
      // activation. Window dims are read here and injected so the built-ins
      // stay pure.
      const resolveTransform = (px: number, py: number): Transform => {
        const pointer = { x: px, y: py }
        // The Overlay's footprint at rest (transform 0): the anchored origin
        // (ADR-0021) with the measured Overlay size (ADR-0020). The modifier
        // adds the transform it produces, so this is collision's rect minus
        // that not-yet-applied transform — a modifier clamps what the user
        // sees travel, not the invisible source.
        const { width, height } = resolveOverlaySize()
        const origin = resolveAnchoredOrigin()
        const overlayRect: Rect = {
          left: origin.left,
          top: origin.top,
          width,
          height,
          right: origin.left + width,
          bottom: origin.top + height,
        }
        let next: Transform = { x: px - startX, y: py - startY }
        for (const modifier of modifiers) {
          next = modifier({
            transform: next,
            overlayRect,
            pointer,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
          })
        }
        return next
      }

      // Move the Overlay node imperatively (ADR-0018): origin + the current
      // post-modifier transform, written straight to the node — never via a
      // React render, so the Overlay subtree does not re-render per frame.
      // Exposed on the registry so a late-mounting node (the `useOverlay` ref
      // firing after the drag starts) positions itself on mount.
      const placeOverlay = (node: HTMLElement) => {
        const origin = resolveAnchoredOrigin()
        node.style.transform = `translate3d(${origin.left + transform.x}px, ${origin.top + transform.y}px, 0)`
      }
      overlay.place = placeOverlay

      // The Overlay rect collision tests against (ADR-0017): the *measured*
      // Overlay size anchored at origin + transform, so Over matches what the
      // user sees travel even when the Overlay differs in size from the source.
      const overlayRect = (): Rect => {
        const { width, height } = resolveOverlaySize()
        const origin = resolveAnchoredOrigin()
        const left = origin.left + transform.x
        const top = origin.top + transform.y
        return {
          left,
          top,
          width,
          height,
          right: left + width,
          bottom: top + height,
        }
      }

      // Collision runs against the post-modifier Overlay rect, plus the live
      // pointer needed by `pointerWithin` (ADR-0006, ADR-0007).
      const overAt = (px: number, py: number): string | null =>
        collisionDetection({
          pointer: { x: px, y: py },
          overlayRect: overlayRect(),
          zones: zoneRects,
        })

      // Recompute Over and publish ONLY when it changes (ADR-0018): the
      // high-frequency transform never enters the store, so consumers re-render
      // on Over transitions, not per frame.
      const syncOver = () => {
        const next = overAt(latestX, latestY)
        if (next !== over) {
          over = next
          commit({ over })
        }
      }

      // The Hover target under the cursor (ADR-0024): a pointer-only hit-test
      // over the Hover-target rects, independent of the Overlay and of the Drop
      // Action's pluggable collision. It reuses `pointerWithin` (the cursor
      // inside a target, closest-center on overlap) with a throwaway rect, NOT
      // the configured detector — `closestCenter` would never return null and a
      // dwell would fire on the nearest target forever.
      const hoverAt = (px: number, py: number): string | null =>
        pointerWithin({
          pointer: { x: px, y: py },
          overlayRect: ZERO_RECT,
          zones: hoverRects,
        })

      const dwellOf = (targetId: string | null) =>
        targetId === null ? undefined : hovers.get(targetId)?.dwellRef.current

      const clearDwell = () => {
        if (dwellTimer !== null) {
          clearTimeout(dwellTimer)
          dwellTimer = null
        }
      }

      // (Re)anchor the dwell clock at the live pointer for `targetId` (ADR-0024):
      // clear any pending timer and, if the target carries a dwell config,
      // schedule `onDwell` for `dwellMs` later. Re-anchoring on each call is
      // what keeps a moving cursor from ever firing — only a settled one lets
      // the timer run out. A `setTimeout` (not the rAF loop, which is
      // movement-driven and stops when the pointer stops) is what fires the
      // dwell of a still cursor.
      const armDwell = (targetId: string | null) => {
        clearDwell()
        const cfg = dwellOf(targetId)
        if (!cfg) return
        dwellAnchorX = latestX
        dwellAnchorY = latestY
        dwellTimer = setTimeout(() => {
          dwellTimer = null
          // Read the handler at fire time (so a changed `onDwell` is honoured)
          // and fire only if the cursor is still over the same target.
          const live = dwellOf(targetId)
          if (live && hover === targetId)
            live.onDwell({ id, data: item.dataRef.current })
        }, cfg.dwellMs)
      }

      // Recompute the Hover target and run the dwell clock (ADR-0024). Publishes
      // a Hover transition to the store ONLY when it changes (ADR-0018), like
      // syncOver; on an unchanged target it re-anchors the clock once the cursor
      // has drifted past the settle tolerance, so sweeping inside a target never
      // fires while settling does.
      const syncHover = () => {
        const next = hoverAt(latestX, latestY)
        if (next !== hover) {
          hover = next
          commit({ hover })
          armDwell(next)
          return
        }
        const cfg = dwellOf(hover)
        if (
          cfg &&
          Math.hypot(latestX - dwellAnchorX, latestY - dwellAnchorY) >
            cfg.tolerance
        )
          armDwell(hover)
      }

      const draggingActive = (): ActiveSnapshot<Data> => ({
        id,
        data: item.dataRef.current,
        status: 'dragging',
        originRect,
      })

      // End the drag on a terminal outcome (ADR-0013): clear Active and Over
      // and publish the resolution in the SAME emit, so one render sees
      // `active === null` alongside the outcome. The resolution then lingers
      // until the next drag's first commit overwrites it.
      const resolve = (outcome: DropOutcome) => {
        // Re-base the Return target to where the source sits NOW (ADR-0017): a
        // drag may have scrolled the page/list under the fixed Overlay, so the
        // frozen origin is stale. Re-measure the source (falling back to the
        // frozen origin if it has unmounted or collapsed to a zero-area rect).
        const reg = items.get(id)
        const measured = reg && measure({ node: reg.node, id, type: 'item' })
        const source =
          measured && (measured.width > 0 || measured.height > 0)
            ? measured
            : originRect
        // The Overlay's home (ADR-0022): its measured size centered on the
        // source's live rect, so a size-mismatched Overlay returns to its slot,
        // not the source's corner. Equals the source rect when the two match.
        const { width, height } = resolveOverlaySize()
        const left = source.left + (source.width - width) / 2
        const top = source.top + (source.height - height) / 2
        const homeRect: Rect = {
          left,
          top,
          width,
          height,
          right: left + width,
          bottom: top + height,
        }
        // Re-express the release transform against that home: the Overlay's
        // release position (anchored origin + transform) is unchanged, so the
        // Return eases from where it was released to the centered, live home.
        const origin = resolveAnchoredOrigin()
        const rebased: Transform = {
          x: origin.left + transform.x - left,
          y: origin.top + transform.y - top,
        }
        commit({
          active: null,
          over: null,
          hover: null,
          resolution: {
            outcome,
            homeRect,
            transform: rebased,
            item: { id, data: item.dataRef.current },
          },
        })
        overlay.place = null
        // Terminal outcome reached (ADR-0013): free this Drop Action for the
        // next drag (ADR-0021). A resolve includes the async Dropping phase, so
        // the flag stays set until the Drop truly settles — never freed at the
        // pointerup-time cleanup, which can precede resolution.
        dragInFlight = false
      }

      const flush = () => {
        frame = null
        transform = resolveTransform(latestX, latestY)
        if (overlay.node) placeOverlay(overlay.node)
        syncOver()
        syncHover()
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

      // Zones move in viewport coords only on scroll/resize/layout-change —
      // never on pointer move — so re-measuring is event-driven and
      // rAF-throttled, not per frame (ADR-0017). Capture-phase scroll catches
      // nested scroll containers.
      const remeasure = () => {
        zoneRects = measureZones()
        hoverRects = measureHovers()
        syncOver()
        syncHover()
      }
      const onScrollResize = () => {
        if (remeasureFrame === null) {
          remeasureFrame = requestAnimationFrame(() => {
            remeasureFrame = null
            remeasure()
          })
        }
      }

      // Tear down every listener and any pending frame. Called on every exit
      // path — resolution and cancellation alike — so nothing leaks.
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('scroll', onScrollResize, true)
        window.removeEventListener('resize', onScrollResize)
        if (frame !== null) cancelAnimationFrame(frame)
        if (remeasureFrame !== null) cancelAnimationFrame(remeasureFrame)
        // A pending dwell never outlives the drag (ADR-0024): cleanup runs on
        // every exit path, so `onDwell` cannot fire after release/cancel.
        clearDwell()
        // The grabbing cursor ends at release (ADR-0019): the pointer is up, so
        // it must clear even though an async Dropping phase may still be in
        // flight. cleanup runs on every exit path, exactly once per drag.
        if (grabCursor) hideGrabbingCursor()
      }

      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        cleanup()

        // Resolve against the final pointer position, regardless of whether a
        // throttled frame had a chance to fire. The same post-modifier
        // transform that drives the Overlay drives this resolution.
        latestX = e.clientX
        latestY = e.clientY
        transform = resolveTransform(e.clientX, e.clientY)
        if (overlay.node) placeOverlay(overlay.node)
        const overId = overAt(e.clientX, e.clientY)
        const dragged: DraggedItem<Data> = { id, data: item.dataRef.current }

        // Released over nothing — a No-drop (CONTEXT.md): no Zone, so no Drop
        // and no Dropping phase. It is a Return, not a Reject.
        if (overId === null) {
          resolve('no-drop')
          return
        }

        // Enter the Dropping phase: the Overlay persists (status 'dropping',
        // origin rect and over kept) across the async gap between release and
        // resolution (ADR-0004). Collision is frozen at the release position.
        over = overId
        commit({
          active: {
            id,
            data: item.dataRef.current,
            status: 'dropping',
            originRect,
          },
          over: overId,
          // The pointer is up, so nothing is Hovered through the Dropping phase
          // (the dwell timer is already cleared by cleanup, ADR-0024).
          hover: null,
        })

        // 1 Zone = 1 onDrop (ADR-0014): a single handler decides; the Item
        // reacts (ADR-0003). `accept` / `reject` each settle the Drop once —
        // the first call wins — and run the Item's `onAccept` / `onReject`
        // with their payload. A handler that finishes without a verdict,
        // including one that never responds, is still a Reject, but an inert
        // one: no `onReject` fires, so the no-op path stays inert (ADR-0003).
        let settled = false
        const accept = (payload: Accept) => {
          if (settled) return
          settled = true
          item.onAcceptRef.current?.(dragged, payload)
          resolve('accepted')
        }
        const reject = (payload: Reject) => {
          if (settled) return
          settled = true
          item.onRejectRef.current?.(dragged, payload)
          resolve('rejected')
        }
        const verdict: DropVerdict<Accept, Reject> = { accept, reject }

        // The handler may decide synchronously, await before deciding, or
        // return a Promise. Await it; if it settles no verdict, that is the
        // inert Reject, so the Overlay never sticks.
        const result = zones.get(overId)?.onDropRef.current?.(dragged, verdict)
        Promise.resolve(result).then(() => {
          if (settled) return
          settled = true
          resolve('rejected')
        })
      }

      // Esc or pointercancel abort an in-flight drag: a Cancel (CONTEXT.md).
      // No Drop, so onDrop and onAccept never run; we publish a 'cancelled'
      // resolution from wherever the Overlay currently is and clear Active.
      const onCancel = (e?: PointerEvent) => {
        if (e && e.pointerId !== pointerId) return
        cleanup()
        transform = resolveTransform(latestX, latestY)
        resolve('cancelled')
      }

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel()
      }

      // Initial publish: the drag begins from the original press point, so the
      // Overlay does not jump on activation.
      transform = resolveTransform(activateX, activateY)
      over = overAt(activateX, activateY)
      hover = hoverAt(activateX, activateY)
      commit({ active: draggingActive(), over, hover, resolution: null })
      if (overlay.node) placeOverlay(overlay.node)
      // A drag that begins already over a Hover target arms the dwell at once.
      armDwell(hover)
      // Show grabbing only once the press has truly become a drag (not on a
      // click/tap that never activated) — ADR-0019.
      if (grabCursor) showGrabbingCursor()

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('scroll', onScrollResize, true)
      window.addEventListener('resize', onScrollResize)
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
      // The press never became a drag, so free the Drop Action (ADR-0021).
      if (decision === 'activate') beginDrag(e.clientX, e.clientY)
      else dragInFlight = false
    }

    const onPendingEnd = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      // Released (or cancelled) before activation — it was a click/tap. The
      // press never became a drag, so free the Drop Action (ADR-0021).
      endPending()
      dragInFlight = false
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
