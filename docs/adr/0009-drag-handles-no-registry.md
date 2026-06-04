# Drag handles need no registry; useDragHandle is a thin trigger

The original work code kept a per-item registry to ferry the
`listeners`/`attributes` that dnd-kit's `useDraggable` generated over to a
remotely-rendered drag handle. With a custom Pointer Events engine there
are no opaque listeners to ferry: a handle is just an element whose
`onPointerDown` calls `startDrag(id)`.

The Item already registers its `data` and node in the closure store —
needed anyway for origin measurement and collision — so
`useDragHandle(id) → { onPointerDown }` looks the Item up by `id` at event
time. By default the whole Item is its own handle (through `useItem`'s
`dragHandleProps`); with `customDragHandle` the Item still registers but
its wrapper does not trigger, and the handle is placed wherever
`useDragHandle(id)` is spread — including outside the Item's subtree. The
handle only triggers; the Item is always what is measured and travels.

## Considered options

- **Keep the registry** — rejected. It existed solely to work around
  dnd-kit's opaque listeners; with our own engine it is dead weight.

## Consequences

A whole layer of the original design — the registry plus listener
ferrying — is removed. `useDragHandle` becomes a pure derivation over the
Item registration the store already holds.
