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

// The dragged Item as seen by a Zone's onDrop and the Item's onAccept: an
// `id` paired with its typed `data` (CONTEXT.md — Item).
export type DraggedItem<Data = unknown> = {
  id: string
  data: Data
}

// A held Item is 'dragging'; between release and resolution it is
// 'dropping' (ADR-0004). The skeleton resolves synchronously, but the
// status is part of the shape every later slice inherits.
export type DropStatus = 'dragging' | 'dropping'

// Accept is explicit and opt-in: only `respond('accepted')` accepts;
// anything else, including never responding, is a Reject (ADR-0003).
export type Respond = (status: 'accepted') => void

export type ZoneDropHandler<Data = unknown> = (
  item: DraggedItem<Data>,
  respond: Respond,
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
export type UseItemOptions<Data = unknown> = {
  onAccept?: (item: DraggedItem<Data>) => void
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
