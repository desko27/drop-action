# Zone collision rects clipped to their visible region

_Extends ADR-0017 (the live Zone-rect measuring loop) and refines the
collision contract of ADR-0006: the Zone rects a detector receives are now the
**clipped rects**, not the raw `getBoundingClientRect`._

ADR-0017 keeps Zone rects fresh against scroll, but it re-measures the *full*
bounding rect — so a Zone living inside an `overflow` scroll container still
collides from the half scrolled out behind the container's edge. Over fired on
a region the user could not see; the library felt broken in exactly the
scrolling case ADR-0017 set out to fix. The fix is to test against each Zone's
**clipped rect** — its raw rect intersected with the box of every clipping
ancestor and the viewport — so only the visible part of a Zone can be Over.

- **The clip lives in the engine's `measureZones()`, not in `measure` or the
  detectors.** `measure` stays "read raw geometry off the node" (it measures
  Items and the Overlay too, neither of which should be clipped), and the
  detectors stay pure rect-in functions (ADR-0006). After measuring a Zone the
  engine intersects its raw rect with each clipping ancestor's border box,
  walking up the DOM and stopping at the first `position: fixed` element (whose
  containing block is the viewport, so a scroll ancestor never clips it). An
  ancestor clips when its computed `overflow` on either axis is
  `scroll`/`auto`/`hidden`/`clip`; the viewport is the root clipper. The
  clipped rect is what flows into `zoneRects` and on to collision.

- **A Zone clipped to nothing is dropped from the snapshot, not passed with a
  zero rect.** `rectIntersection` and `pointerWithin` already ignore a
  zero-area rect, but `closestCenter` has no overlap requirement — it would
  still hand Over to a fully-hidden Zone's phantom center. Rather than special-
  case one detector, a Zone whose clipped rect has zero width or height (strict
  `<= 0`, no magic threshold) is simply not a collision candidate. The rule
  reads itself: a Zone you cannot see cannot be Over, under any detector, and
  `closestCenter` snaps to the nearest *visible* Zone. The exclusion is a
  per-re-measure filter, not a permanent removal: `measureZones()` always
  iterates the full Zone registry and re-applies clip-and-exclude, so a Zone
  scrolled out and then back into view (an ancestor scrolled mid-drag) re-enters
  the snapshot and becomes Over-able again.

- **The clipping-ancestor chain is resolved once per Zone at drag start and
  cached; re-measures only re-read those ancestors' rects.** Discovering which
  ancestors clip needs `getComputedStyle` (it forces style); the ancestors'
  positions, not the DOM shape, are what scrolling invalidates. So `beginDrag`
  resolves and caches the clipper chain for **every registered Zone** at drag
  start — including Zones that start fully clipped, so they can recompute their
  clip and re-enter when scrolled into view — and the scroll/resize re-measure
  loop only does the `getBoundingClientRect` + intersect it already implied,
  keeping per-re-measure cost in the same order ADR-0017 accepted, with the
  expensive part off the hot path.

## Considered options

- **Clip inside `measure`** — rejected. `Measure` is a public, replaceable
  strategy and the same function measures Items and the Overlay; clipping there
  would be lost under a custom `measure` and would have to branch on
  `type === 'zone'`. Clipping is a Zone-only, collision-only concern that
  belongs in the engine's Zone-measuring loop.
- **Keep fully-clipped Zones with a zero-area rect** — rejected. Leaves the
  `closestCenter` trap and gives a vacuous rect a meaningless center. Excluding
  them is the cleaner invariant.
- **Exclude the scrollbar gutter (clip against the padding box)** — deferred.
  More correct by ~15px, but scrollbar geometry varies with OS overlay
  scrollbars and RTL, and the bug is "a whole hidden half wins", which the
  border-box clip already fixes. Documented as a known imprecision to revisit
  if dogfooding asks.
- **Handle occlusion (Zones covered by elements painted on top)** — out of
  scope. That needs hit-testing, not rect algebra, and would break the pure-
  detector contract. Only geometric clipping is in scope.

## Consequences

- The "Zone rects" a detector sees (ADR-0006 / `CollisionArgs.zones`) are the
  clipped rects; a custom detector inherits clipping for free and never sees a
  fully-hidden Zone.
- If an ancestor's `overflow` changes, or a Zone is re-parented, mid-drag, the
  cached clipper chain goes stale until the next drag — the same class of limit
  ADR-0017 already accepts for size changes without a `ResizeObserver`.
