# Closure-scoped store, no provider

_Refined by ADR-0018: the store no longer carries the per-frame Overlay
`transform` (moved imperatively, out of React), and its reads are now
referentially stable so a consumer re-renders only when its own slice changes.
The closure-scoped, provider-less design below still holds._

All shared drag state — the active Item, the current Zone, the registered
Zone rects used for collision detection, and the drag-handle registry —
lives in a store created inside the `createDropAction()` closure and is
read through `useSyncExternalStore`. We deliberately do not introduce a
React Context provider. This preserves the provider-less public API and
extends the pattern already used for the drag-handle registry, so a
consumer never has to mount a `<Provider>`.

## Consequences

`createDropAction()` is normally called at module top level, so its
store is effectively module-global: every React tree that imports a given
Drop Action shares that Drop Action's drag state. This is acceptable
because drag state is client-only and transient, but it carries two
constraints worth remembering:

- **No per-tree isolation.** Two isolated subtrees of the same Drop Action
  (e.g. two Storybook stories on one page) share live drag state.
- **The store must never hold non-ephemeral or request-scoped data**, or
  it becomes an SSR / multi-tenant leak. It is a drag-session scratchpad,
  nothing more.
