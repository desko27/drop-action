# Collision detection: single-winner contract, rects snapshotted at drag start

_The snapshot-at-drag-start default is superseded by ADR-0017: Zone rects are
now re-measured on scroll/resize during the drag (the "opt-in measuring
strategy" foreseen in Consequences became always-on core behaviour). The
single-winner contract and `rectIntersection` default below still hold._

Collision detection is a pluggable function
`(args: { pointer, overlayRect, zones }) => zoneId | null` that returns a
single winning Zone, not dnd-kit's ordered `Collision[]` — because Over
is singular in this API (`useOver` asks about one Zone). Built-ins ship
tree-shakeable: `rectIntersection` (default), `pointerWithin`,
`closestCenter`.

Because each Drop Action's store only holds its own Zones (ADR-0002), a
detector only ever sees Zones from the same Drop Action. Cross-action
filtering is therefore automatic, and the original
`sameActionRectIntersection` workaround — needed only because a single
global dnd-kit context mixed every action's Zones — is removed.

Zone rects are measured once at drag start (a snapshot); collisions
recompute against that snapshot on each `pointermove`, throttled to an
animation frame.

## Considered options

- **Ordered `Collision[]` list, like dnd-kit** — rejected. Over is
  singular; a single-winner return is a simpler contract to implement a
  custom detector against.
- **Live re-measurement of Zone rects every frame** — deferred. Calling
  `getBoundingClientRect` in a loop over many Zones risks layout
  thrashing. Snapshot is the cheap, sane default.

## Consequences

Zones that move, resize, or scroll during a drag (e.g. autoscrolling
columns) go stale under the snapshot default. Live re-measurement and
autoscroll are deferred to an opt-in measuring strategy.
