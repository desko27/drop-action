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
  type: 'item' | 'zone'
}
export type Measure = (target: MeasureTarget) => Rect

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
// first); `originRect` is the source Item's rect at drag start. The
// pointer position and window dims are injected by the engine so built-ins
// stay pure and testable (no `window` reads inside a modifier).
export type ModifierArgs = {
  transform: Transform
  originRect: Rect
  pointer: { x: number; y: number }
  windowWidth: number
  windowHeight: number
}

// A composable transform adjuster (CONTEXT.md — Modifier). Modifiers run
// left-to-right, each feeding the next; the final value drives both the
// Overlay's CSS transform and the rect collision tests against (ADR-0007).
export type Modifier = (args: ModifierArgs) => Transform

export type CreateDropActionOptions = {
  measure?: Measure
  // The pointer-type-aware threshold a press must cross to become a drag
  // (ADR-0012). Defaults are resolved per pointer kind in the engine.
  activationConstraint?: ActivationConstraint
  // The modifier pipeline applied to the Overlay transform (ADR-0007).
  // Defaults to `[restrictToWindowEdges]` in the factory.
  modifiers?: Modifier[]
  // The strategy that picks which Zone is Over (ADR-0006). Defaults to
  // `rectIntersection` in the factory.
  collisionDetection?: CollisionDetection
}

// Options for the `useItem` primitive. `customDragHandle` narrows the
// grabbable area: the Item still registers (is measured and travels) but
// its own spreadable props no longer trigger a drag — only a
// `useDragHandle(id)` element does (ADR-0009).
export type UseItemOptions<Data = unknown, Accept = void, Reject = void> = {
  onAccept?: (item: DraggedItem<Data>, payload: Accept) => void
  onReject?: (item: DraggedItem<Data>, payload: Reject) => void
  customDragHandle?: boolean
}

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
