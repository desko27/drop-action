# Collision rects: live-tracked against scroll, sized from the measured Overlay

_Extended by ADR-0020: the same "measured Overlay, not source" principle now
also governs the modifier clamp (`restrictToWindowEdges`), via an `overlayRect`
on `ModifierArgs`._

_Refined by ADR-0021 and ADR-0022: the origin the Overlay anchors at is now the
**grab-anchored origin** (configurable, default `proportional`), and the live
re-base below targets the Overlay's **centered home**, not the source's
top-left._

Two refinements to how the rect collision detection tests against is built,
both found dogfooding in ORION.

- **Zone rects are re-measured during the drag, not frozen at start.** ADR-0006
  snapshotted every Zone rect at drag start and deferred live re-measurement to
  an opt-in strategy. Dogfooding showed that scrolling mid-drag silently drifts
  Over off the visible Zones — the library *feels broken* — so this is not a
  knob: re-measurement is always-on core behaviour. The engine re-measures Zone
  rects on `scroll` (capture phase, to catch nested scrollers) and `resize`,
  rAF-throttled. The source `originRect` stays frozen *for the live gesture*:
  the Overlay is `position: fixed` and tracks the pointer, so it (and the rect
  collision tests against) need no origin re-measure — only the Zones, which
  scroll under it, do. The one exception is the terminal `resolution` snapshot,
  which re-measures the source at release (falling back to the frozen origin if
  it has unmounted or collapsed to a zero-area rect) and re-bases the release
  transform onto it, so a Return (Snap-back) eases back to where the source
  *now* sits rather than its stale drag-start position (ADR-0013). The release
  position and the home it eases to are unchanged by the re-base; only the frame
  they are expressed in becomes the source's live one. Zones move in viewport
  coordinates only on scroll/resize/layout-change,
  never on pointer move, so there is no per-`pointermove` cost and the per-frame
  `getBoundingClientRect` thrash ADR-0006 feared is avoided; a re-measure
  recomputes Over but emits only on an Over change (ADR-0018). Zones that resize
  mid-drag with no scroll/resize stay uncovered until a `ResizeObserver` is
  added.

- **The collision rect is sized from the measured Overlay, not the source
  Item.** ADR-0007 said collision runs against the "post-modifier Overlay rect",
  but the engine built that rect from the source Item's bbox translated by the
  transform — correct only while the Overlay matches the source's size. When
  they differ (a tall accordion-row source vs a compact chip Overlay), Over
  fired on the invisible *source* footprint, contradicting 0007's own principle
  ("Over matches what the user sees travel"). The rendered Overlay now registers
  its node through the public `useOverlay()` primitive (ADR-0018); the engine
  measures its size once on mount and anchors it at origin + transform. With no
  Overlay rendered, it falls back to the source-translated rect.

## Considered options

- **Keep an opt-in / configurable measuring strategy, as ADR-0006 deferred** —
  rejected. Scroll-drift makes the library feel broken; correctness here is not
  the consumer's call, so it ships always-on rather than as a strategy seam.
- **Re-measure every frame** — rejected. The `getBoundingClientRect`-in-a-loop
  thrash ADR-0006 named, and needless since Zones only move on scroll/resize.
- **Switch the default detector to `pointerWithin`** (finding 3a) — rejected.
  `pointerWithin` ignores the Overlay rect and follows the raw pointer, so it
  diverges from the visibly-constrained Overlay under axis modifiers, breaking
  ADR-0007. `rectIntersection` stays the default; `pointerWithin` is opt-in per
  Drop Action. Fixing the Overlay sizing above also reduces the area-flicker
  that motivated the suggestion.
- **Only `<Active>` registers the Overlay; snap-back falls back** — rejected.
  The snap-back path is the premium one; leaving it on the source-rect fallback
  inverts the intent. `useOverlay()` is public so `<Active>`, `<SnapBack>`, and
  custom overlays all adopt it.

## Consequences

- **Supersedes ADR-0006's snapshot default** (the single-winner contract in
  0006 still holds). **Refines ADR-0007** — the "Overlay rect" is the measured
  Overlay, not the source assumed equal-sized.
- The `scroll` / `resize` listeners + re-measure loop land in the core bundle,
  accepted as the price of not feeling broken.
