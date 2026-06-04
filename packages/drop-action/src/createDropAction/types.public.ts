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

export type CreateDropActionOptions = {
  measure?: Measure
  activationConstraint?: ActivationConstraint
}
