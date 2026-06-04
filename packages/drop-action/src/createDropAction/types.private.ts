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

// The travelling Item, plus the geometry the Overlay needs to position
// itself: where the source Item started (`originRect`) and how far the
// pointer has moved since (`transform`).
export type ActiveSnapshot<Data> = {
  id: string
  data: Data
  status: DropStatus
  originRect: Rect
  transform: { x: number; y: number }
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

// The whole reactive snapshot read through useSyncExternalStore. `null`
// active means no drag is in flight — the inert state the server yields.
// `resolution` carries how the last drag ended; it persists between drags
// so a consumer that renders after a drag can still read the outcome.
export type DropActionState<Data> = {
  active: ActiveSnapshot<Data> | null
  over: string | null
  resolution: Resolution<Data> | null
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
