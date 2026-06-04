import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

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

export type CreateDropActionOptions = {
  measure?: Measure
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
