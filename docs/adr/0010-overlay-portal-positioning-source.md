# Overlay: portalled to body, fixed + translate3d, source Item untouched

_Refined by ADR-0018: the `translate3d` below is now written imperatively by the
engine each frame (via the `useOverlay()` primitive's `ref`), not through a
React render, so the Overlay subtree no longer re-renders per frame. The portal,
fixed + translate3d, and untouched-source decisions still hold._

Three decisions about how the Overlay renders:

- **Portal.** The Overlay portals to `document.body` by default (a
  `container` prop overrides it, for Shadow DOM or a dialog), so an
  ancestor's `overflow: hidden`, `transform`, or stacking context cannot
  clip it or bury it behind other content. `createPortal` is imported
  only by the Overlay (`Active`) module, so consumers who never render an
  Overlay do not pull in `react-dom`.
- **Positioning.** The Overlay is `position: fixed` and moved with
  `transform: translate3d(x, y, 0)` using the post-modifier delta
  (ADR-0007), starting over the Item's origin rect. This is
  compositor-only — no reflow on the drag path.
- **Source Item.** The source Item stays in the DOM untouched; the core
  never hides or gaps it. `useItem` exposes `isDragging` so the consumer
  owns the source visuals (dim, placeholder, gap).

## Considered options

- **In-place Overlay (no portal)** — rejected. Clipped or buried by
  ancestor `overflow` / transforms / stacking contexts.
- **Library-managed source hiding and gap** — rejected. Opinionated and
  against the headless boundary (ADR-0004); left to the consumer via
  `isDragging`.

## Consequences

`react-dom` is required only on the Overlay path, not for drag itself.
Sortable / reorder placeholder behaviour (the auto-gap that opens to show
where an Item will land) is anticipated as a separate opt-in module, like
Snap-back — never core.
