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

export type ItemRegistration<Data> = {
  node: HTMLElement
  dataRef: Ref<Data>
  onAcceptRef: Ref<((item: DraggedItem<Data>) => void) | undefined>
}

// Geometry-only Zone registration. A Zone registers its node for measuring
// and collision; how a Drop on it is handled is a separate subscription
// (the drop-listener registry below — issue #9), so a Zone stays
// measurable even when its only drop handler lives remotely via
// `useDropEvent`.
export type ZoneRegistration = {
  node: HTMLElement
}

// A drop listener keeps a ref to the latest handler so a subscriber can
// re-render without re-subscribing. Many listeners may share one zoneId.
export type DropListener<Data> = Ref<ZoneDropHandler<Data>>
