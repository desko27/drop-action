# Per-frame Overlay movement is imperative; the store carries only low-frequency state

Dogfooding a busy page in ORION (dozens of Zones) showed the Overlay trailing
the cursor and Over-highlights flickering: the engine replaced the whole
`useSyncExternalStore` snapshot on every animation frame, so every `useActive` /
`useOver` / `isDragging` consumer re-rendered every frame even with no Over
change. Three coupled changes take the per-frame work out of React.

- **The Overlay moves imperatively.** The engine writes the Overlay node's
  `translate3d` directly each frame, on the node registered through the new
  `useOverlay()` primitive (the same registration ADR-0017 measures for
  collision). The per-frame `transform` therefore lives only in the engine
  closure and never enters the reactive store — so `transform` is removed from
  `ActiveSnapshot` / `useActive()` (a breaking change, taken in prerelease).
  Headless overlays position via `useOverlay()`'s `ref` + `style`; a reactive
  per-frame transform read (`useTransform()`) is deferred until a real need
  appears.

- **The store emits only on transitions.** With `transform` gone, the store
  holds only low-frequency state — `active` (sans transform), `over`,
  `resolution` — emitted at drag start, status change, Over change, and
  resolution, never per frame.

- **Reads are referentially stable, zero-dep.** Each hook calls plain
  `useSyncExternalStore` with a `getSnapshot` that returns a stable or primitive
  value, so React's `Object.is` bail-out re-renders a consumer only when *its
  own* slice changes: `useOver(zoneId)` returns a store-memoised item or `null`
  (only the two Zones in an A→B transition re-render, not all of them);
  `isDragging` returns a boolean; `useActive` / `useResolution` return cached
  objects. No `use-sync-external-store/with-selector` shim — the
  zero-dependency invariant holds.

## Considered options

- **Split a high-frequency `transform` slice into the store** (the finding's
  own idea, 4iii) — rejected as insufficient. Whatever subscribes to that slice
  still re-renders per frame; the only way the Overlay does no per-frame React
  work is to move it imperatively, so `transform` leaves the store entirely
  rather than being split out.
- **Add `use-sync-external-store/with-selector` for selectors** — rejected. It
  is a runtime dependency; "Zero-dependency" is the library's first invariant.
  Store-memoised stable snapshots get the same selectivity for free.
- **Keep `useActive().transform` reactive** — rejected for now. It forces a
  per-frame channel; `useOverlay()` covers positioning, and `useTransform()` can
  be added additively if a real headless need surfaces.

## Consequences

- **Refines ADR-0002** — the closure store, no provider, still holds, but it no
  longer carries per-frame state and its reads are now selective.
- **Refines ADR-0010** — the Overlay's `fixed` + `translate3d` positioning is
  unchanged, but applied imperatively rather than through a React render.
- **Extends ADR-0008** with a new primitive, `useOverlay()`, of which `<Active>`
  / `<SnapBack>` are sugar.
- **Breaking:** `ActiveSnapshot.transform` / `useActive().transform` are
  removed; headless overlays migrate to `useOverlay()`.
