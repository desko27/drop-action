import type {
  DraggedItem,
  DropOutcome,
  DropStatus,
  Rect,
  Transform,
  ZoneDropHandler,
} from './types.public'

// A minimal stable container, used in place of React's version-churning
// ref types so the registries can hold the latest data/handlers without
// re-registering on every render.
export type Ref<T> = { current: T }

// The travelling Item, plus the source's origin rect. The per-frame Overlay
// transform is NOT here: the Overlay is moved imperatively (ADR-0018), so the
// transform lives only in the engine and never re-renders consumers each frame.
export type ActiveSnapshot<Data> = {
  id: string
  data: Data
  status: DropStatus
  originRect: Rect
}

// The terminal snapshot the core publishes the instant a drag ends
// (ADR-0013), read with `useResolution()`. Emitted atomically as `active`
// becomes null and kept until the next drag starts. `transform` is the
// Overlay delta at the end — the release point for a Drop or No-drop, the
// live position for a Cancel — so a Return animation can ease from there
// back to `originRect`.
export type Resolution<Data> = {
  outcome: DropOutcome
  originRect: Rect
  transform: Transform
  item: DraggedItem<Data>
}

// The shared handle on the rendered Overlay node (ADR-0017, ADR-0018). The
// `useOverlay` ref sets `node`; the engine sets `place` for the duration of a
// drag so it (and a late-mounting node, via the ref) can position the Overlay
// imperatively. `place` is null between drags.
export type OverlayRegistry = {
  node: HTMLElement | null
  place: ((node: HTMLElement) => void) | null
}

export type ItemRegistration<Data, Accept = void, Reject = void> = {
  node: HTMLElement
  dataRef: Ref<Data>
  onAcceptRef: Ref<
    ((item: DraggedItem<Data>, payload: Accept) => void) | undefined
  >
  onRejectRef: Ref<
    ((item: DraggedItem<Data>, payload: Reject) => void) | undefined
  >
}

// A Zone registers its node for measuring/collision together with its single
// drop handler (ADR-0014: 1 Zone = 1 onDrop). The handler is optional — a
// Zone with none is still measurable and simply Rejects any Drop. A ref keeps
// the latest `onDrop` so re-renders never re-register the node.
export type ZoneRegistration<Data = unknown, Accept = void, Reject = void> = {
  node: HTMLElement
  onDropRef: Ref<ZoneDropHandler<Data, Accept, Reject> | undefined>
}
