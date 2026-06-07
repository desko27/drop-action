# Hover targets are observe-only; Dwell is timed in the core engine

A **Hover target** is a new participant registered in its own registry,
separate from the Zone drop registry (ADR-0014). It is observe-only — a Drop
never lands on it — so it can overlap a Zone without a "which one wins?"
question, and **Over** stays droppable-only while **Hover** is its
observe-only sibling. Its over-ness is resolved by a *fixed* pointer hit-test
(the cursor inside the target's clipped rect, ADR-0023), never the pluggable
collision detection (ADR-0006) and never against the Overlay rect. **Dwell** —
the drag *settling* over a Hover target (the cursor staying within `tolerance`
pixels for `dwellMs`) — fires `onDwell` once, and its timer lives in the core
drag loop (ADR-0001), **not** in an opt-in subpath Extension (ADR-0004) like
Snap-back.

The surprising part is Dwell living in the core rather than mirroring
Snap-back as a subpath. Detecting "the cursor moved too much inside the area"
needs the per-frame pointer, which the store deliberately withholds (ADR-0018
commits on transitions, never per frame). A subpath built on the reactive
`isHovering` boolean cannot see intra-target movement, so cursor-stability is
impossible app-side. The rAF loop is also movement-driven and stops when the
pointer stops — exactly when a still dwell should fire — so Dwell owns a
`setTimeout`, reset on a Hover-target change and on movement beyond
`tolerance`. Dwell-with-tolerance is a sibling of the Activation constraint's
delay+tolerance gesture (ADR-0012), which is already core.

The surface is hooks only — `useHover(id) → { ref, isHovering }` and
`useDwell(id, { onDwell, dwellMs = 500, tolerance = 8 }) → { ref, isDwelling }`
— with no `<Hover>` / `<Dwell>` components: this is edge-case logic, not a node
of the `Item → Active → Zone` visual model the components sugar over (ADR-0008).

## Considered options

- **A `droppable: false` flavour of Zone** — rejected. It conflates the
  Zone / Over / `onDrop` contracts (ADR-0014); a separate registry keeps all
  three clean and lets a Hover target overlap a Zone freely.
- **Reuse the pluggable `collisionDetection` for Hover** — rejected.
  `closestCenter` never returns `null`, so a dwell would always fire on the
  nearest target with no leave→reset. Hover needs "actually over", and the
  pointing semantics of small, stacked targets (e.g. tree-node headers) want
  the cursor, not the Overlay's area — hence a fixed `pointerWithin`.
- **Dwell timer in a subpath over `isHovering`, mirroring Snap-back (ADR-0004)**
  — rejected once cursor-stability was required. Without stability it would
  have worked; with it, the timer needs the per-frame pointer the store hides
  (ADR-0018), which a subpath cannot reach.

## Consequences

The core grows by one registry, one pointer pass, a dwell timer, and a
reactive Hover slice, against a tight size budget (ADR-0004) — accepted because
the per-frame dependency leaves no honest out-of-core alternative. Hover
collision is fixed (`pointerWithin`), unlike Zones' pluggable detector; revisit
only if a real need for overlay-based or configurable Hover appears. The
`isHovering` / `isDwelling` booleans ride the low-frequency store (ADR-0018) —
Hover transitions, not per frame — so consumers re-render on enter/leave only,
while `onDwell` fires imperatively from the engine (like a Zone's `onDrop`,
ADR-0003/ADR-0014) with no React-render latency.
