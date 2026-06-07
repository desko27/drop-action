import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
// Type-only import of the detector contract. collision.ts imports `Rect`
// from here; this back-reference is types-only, so it erases at build time
// and pulls in none of the built-in detectors (they stay tree-shakeable).
import type { CollisionDetection } from './collision'

// A plain geometry snapshot. We avoid leaning on the live DOMRect so the
// engine can run against injected (synthetic) rects in tests and, later,
// non-DOM measuring strategies.
export type Rect = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

// The dragged Item as seen by a Zone's onDrop and the Item's onAccept /
// onReject: an `id` paired with its typed `data` (CONTEXT.md — Item).
export type DraggedItem<Data = unknown> = {
  id: string
  data: Data
}

// A held Item is 'dragging'; between release and resolution it is
// 'dropping' (ADR-0004). The skeleton resolves synchronously, but the
// status is part of the shape every later slice inherits.
export type DropStatus = 'dragging' | 'dropping'

// The four mutually exclusive terminal outcomes of a drag (CONTEXT.md —
// Return, ADR-0013). A Drop over a Zone resolves to 'accepted' or
// 'rejected'; a drag that never reaches a Zone ends as 'no-drop' (released
// over nothing) or 'cancelled' (Esc / pointercancel before any Drop). The
// three non-'accepted' outcomes form a Return — what Snap-back animates.
export type DropOutcome = 'accepted' | 'rejected' | 'no-drop' | 'cancelled'

// The Zone's verdict on a Drop (ADR-0014). An object exposing the two
// outcomes: `accept` / `reject` each settle the Drop once — the first call
// wins — and carry an optional payload to the Item's `onAccept` / `onReject`.
// Accept stays explicit and privileged (ADR-0003); calling neither —
// including never responding — is still a Reject, but an inert one (no
// `onReject` fires). `reject` is the self-documenting decline (e.g. a guard
// clause). Payloads default to `void`, so `accept()` / `reject()` take no
// argument unless a Drop Action types them.
export type DropVerdict<Accept = void, Reject = void> = {
  accept: (payload: Accept) => void
  reject: (payload: Reject) => void
}

export type ZoneDropHandler<Data = unknown, Accept = void, Reject = void> = (
  item: DraggedItem<Data>,
  verdict: DropVerdict<Accept, Reject>,
) => void

// The injectable boundary the engine reads Item/Zone geometry through, so
// behaviour is testable without real layout. `id` and `type` let a test's
// measure return synthetic rects keyed by participant.
export type MeasureTarget = {
  node: HTMLElement
  id: string
  // 'overlay' measures the rendered Active Overlay's own footprint, which can
  // differ from the source Item's (ADR-0017); 'hover' measures a Hover target,
  // clipped like a Zone (ADR-0024); a measure that ignores `type` treats them
  // all like an Item.
  type: 'item' | 'zone' | 'overlay' | 'hover'
}
export type Measure = (target: MeasureTarget) => Rect

// The Activation guard (ADR-0016): an origin veto evaluated on the initial
// pointerdown deciding whether a press may become a drag at all. `true` lets it
// through. Configured per Drop Action via `createDropAction({ shouldStart })`;
// the default is exported as `defaultShouldStart`.
export type ShouldStart = (event: PointerEvent) => boolean

// The three pointer kinds the activation constraint distinguishes. A raw
// PointerEvent.pointerType is mapped onto these (unknown types → 'mouse').
export type PointerKind = 'mouse' | 'pen' | 'touch'

// A distance gesture: the press becomes a drag once the pointer moves this
// many CSS pixels from where it went down. Used for mouse and pen.
export type DistanceActivation = { distance: number }

// A delay gesture: the press becomes a drag once it is held for `delay`
// milliseconds without moving more than `tolerance` pixels. Moving beyond
// the tolerance before the delay elapses abandons activation (a scroll).
// Used for touch, so quick swipes scroll while press-and-hold drags.
export type DelayActivation = { delay: number; tolerance: number }

// The per-Drop-Action gesture model (ADR-0012). Configured once on
// createDropAction, never per Item. Each pointer kind is optional; any kind
// left unset falls back to the pointer-type-aware default.
export type ActivationConstraint = {
  mouse?: DistanceActivation
  pen?: DistanceActivation
  touch?: DelayActivation
}

// The Overlay's proposed displacement from the drag start, an `{ x, y }`
// delta in viewport pixels (ADR-0007). Modifiers receive it and return a
// possibly-adjusted delta.
export type Transform = { x: number; y: number }

// The context a Modifier reasons over. `transform` is the proposed delta
// (the previous modifier's output, or the raw pointer delta for the
// first); `overlayRect` is the Overlay's footprint *at rest* — the source's
// origin position with the measured Overlay size, falling back to the
// source size until the Overlay mounts (ADR-0020). It is the same Overlay
// rect collision tests against, minus the transform the modifier is about
// to produce, so a modifier constrains what the user sees travel, not the
// invisible source. The pointer position and window dims are injected by
// the engine so built-ins stay pure and testable (no `window` reads inside
// a modifier).
export type ModifierArgs = {
  transform: Transform
  overlayRect: Rect
  pointer: { x: number; y: number }
  windowWidth: number
  windowHeight: number
}

// A composable transform adjuster (CONTEXT.md — Modifier). Modifiers run
// left-to-right, each feeding the next; the final value drives both the
// Overlay's CSS transform and the rect collision tests against (ADR-0007).
export type Modifier = (args: ModifierArgs) => Transform

// A point on the Overlay as a fraction of its size per axis: `{ x: 0.5, y: 0.5 }`
// is the centre, `{ x: 0, y: 0 }` its top-left. Values outside `[0,1]` place the
// point outside the Overlay — deliberately, the consumer's choice.
export type GrabAnchorPoint = { x: number; y: number }

// What a grab-anchor function reasons over: the source Item's frozen origin
// rect, the measured Overlay size (falling back to the source size until the
// Overlay mounts), and the press point the drag was grabbed at.
export type GrabAnchorArgs = {
  originRect: Rect
  overlaySize: { width: number; height: number }
  grab: { x: number; y: number }
}

// Where the travelling Overlay hangs from the pointer (CONTEXT.md — Grab
// anchor, ADR-0021). `'proportional'` (the default) holds the same fractional
// grip on the Overlay the press had on the source — identical to an absolute
// offset when Overlay and source match in size, and free of "grabbing the void"
// when the Overlay is smaller. `'preserve'` keeps the source-absolute pixel
// offset. A fixed point pins that fraction of the Overlay under the pointer
// (e.g. `center`). A function computes the point per drag.
export type GrabAnchor =
  | 'proportional'
  | 'preserve'
  | GrabAnchorPoint
  | ((args: GrabAnchorArgs) => GrabAnchorPoint)

export type CreateDropActionOptions = {
  measure?: Measure
  // The pointer-type-aware threshold a press must cross to become a drag
  // (ADR-0012). Defaults are resolved per pointer kind in the engine.
  activationConstraint?: ActivationConstraint
  // The Activation guard (ADR-0016): vetoes ineligible presses by origin/button
  // before activation. Defaults to `defaultShouldStart` in the factory.
  shouldStart?: ShouldStart
  // The modifier pipeline applied to the Overlay transform (ADR-0007).
  // Defaults to `[restrictToWindowEdges]` in the factory.
  modifiers?: Modifier[]
  // The strategy that picks which Zone is Over (ADR-0006). Defaults to
  // `rectIntersection` in the factory.
  collisionDetection?: CollisionDetection
  // Grab/grabbing cursor affordance (ADR-0019). When `true` (default), the
  // handle shows `cursor: grab` at rest and the whole document shows
  // `cursor: grabbing` while a drag is live. Set `false` to take full control
  // of the cursor yourself (the library then touches no cursor).
  grabCursor?: boolean
  // Where the travelling Overlay hangs from the pointer (ADR-0021). Defaults to
  // `'proportional'`; overridable per Item via `useItem`. `'preserve'` keeps the
  // old source-absolute offset; a fixed point (e.g. `center`) or a function pins
  // a chosen point of the Overlay under the pointer.
  grabAnchor?: GrabAnchor
}

// Options for the `useItem` primitive. `customDragHandle` narrows the
// grabbable area: the Item still registers (is measured and travels) but
// its own spreadable props no longer trigger a drag — only a
// `useDragHandle(id)` element does (ADR-0009).
export type UseItemOptions<Data = unknown, Accept = void, Reject = void> = {
  onAccept?: (item: DraggedItem<Data>, payload: Accept) => void
  onReject?: (item: DraggedItem<Data>, payload: Reject) => void
  customDragHandle?: boolean
  // Overrides the Drop Action's grab anchor for this Item (ADR-0021): where its
  // Overlay hangs from the pointer. Falls back to the Drop Action's setting,
  // then `'proportional'`.
  grabAnchor?: GrabAnchor
}

// The dwell callback (ADR-0024): fired once when the drag settles over a Hover
// target. Receives the dragged Item `{ id, data }` (the Active), so a generic
// handler can branch on what is being dragged (spring-load is one use;
// auto-scroll and tab-switch are others).
export type DwellHandler<Data = unknown> = (item: DraggedItem<Data>) => void

// Options for the `useDwell` primitive (ADR-0024). `onDwell` fires once when the
// cursor stays within `tolerance` pixels of a settle point for `dwellMs`
// continuous milliseconds while over the Hover target, re-arming only after the
// drag leaves the target or moves off the settle point.
export type UseDwellOptions<Data = unknown> = {
  onDwell: DwellHandler<Data>
  // How long (ms) the cursor must stay settled before `onDwell` fires.
  // Defaults to 500.
  dwellMs?: number
  // The settle radius in CSS pixels: moving more than this from the settle
  // point re-anchors and restarts the timer, so sweeping through a target never
  // fires. Defaults to 8.
  tolerance?: number
}

// An Extension (ADR-0025): an opt-in module injected into a Drop Action's
// namespace via `createDropAction(options, [ext(), …])`. It receives the channel
// and returns members to merge under it, reading only the channel's public
// members. Packaged as a tree-shakeable subpath module (ADR-0004), so a consumer
// who never imports it bundles none of it. `channel` is typed `unknown` because
// the member set is open — an Extension narrows it to the slice it needs (e.g.
// snap-back to `useActive` / `useResolution` / `useOverlay`).
export type Extension<Members extends object = object> = (
  channel: unknown,
) => Members

// The accessibility + defensive-CSS surface shared by the default Item
// handle and a custom `useDragHandle` (ADR-0011).
export type DragHandleAria = {
  role: 'button'
  tabIndex: number
  'aria-roledescription': 'draggable'
  style: CSSProperties
}

// What `useDragHandle(id)` returns: a thin trigger that calls the engine
// for the given Item id, with the same button a11y the default handle has.
export type DragHandleProps = DragHandleAria & {
  onPointerDown: (event: ReactPointerEvent) => void
}

// What `useItem` spreads onto the consumer's element. By default it is a
// full drag handle (trigger + button a11y); with `customDragHandle` it is
// just `role: 'group'` — the Item is a container and the trigger lives in
// a `useDragHandle(id)` element elsewhere.
export type ItemHandleProps = DragHandleProps | { role: 'group' }

// What `useOverlay` returns: the `ref` to put on the Overlay element (the
// engine measures it for collision and moves it imperatively each frame —
// ADR-0017, ADR-0018) and the base `style` that fixes + layers it. The
// transform is written imperatively, so it is deliberately not in `style`.
export type OverlayProps = {
  ref: (node: HTMLElement | null) => void
  style: CSSProperties
}
