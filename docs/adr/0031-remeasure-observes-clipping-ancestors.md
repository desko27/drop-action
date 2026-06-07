# The re-measure ResizeObserver watches each target's clipping ancestors, not just the target node

_Extends ADR-0026 (the settling burst fed by observers) and builds on ADR-0023
(the clipping-ancestor chain resolved and cached per target). ADR-0026's
`ResizeObserver` observed each target node and `document.documentElement`; this
adds each target's **clipping-ancestor chain** to the observed set, so a target
revealed by an animating clipper keeps the burst alive until it is measured in._

ADR-0026 made an active drag re-measure on DOM/layout change via a settling
burst, and listed its triggers as: scroll, resize, registry change, a
`ResizeObserver` on every target node + `document.documentElement`, and a
`MutationObserver` on the root. Dogfooding `useDwell` as a spring-loaded folder
in ORION hit a gap none of those triggers covers — the **last node in a scroll
list**:

- Drilling into any non-last tree node works: spring-opening it shifts the
  *visible* sibling nodes below it, whose rects change every frame, so the
  burst's stabilization signature (built from the visible, clipped rects —
  ADR-0023) keeps changing and the burst stays alive through the open. The
  just-revealed children are measured in and become Hover/Dwell-able.
- Drilling into the **last** node never works. Its children mount inside a MUI
  `Collapse` — `overflow: hidden`, height animating 0 → auto — so each child is
  **clipped to nothing** (`clipToVisible` → null, ADR-0023) and omitted from the
  collision set *and* from the burst's signature. Opening the last node **moves
  no visible target**, so the signature stabilizes within the two-frame
  early-out and the burst terminates **before** the Collapse reveals the
  children. They are never re-measured into the Hover pass, and Dwell never
  fires on them.

The hole is in **what the `ResizeObserver` watches**. During the Collapse open,
**neither** the trigger set's resize signals fires: the child node keeps its
natural size (only the Collapse *wrapper's* height animates), so the per-node
`ResizeObserver` is silent; and inside a fixed-height scroller the document does
not grow, so the root `ResizeObserver` is silent too. The one element that
resizes every frame is the **clipping ancestor** — and the library already knows
it: it is the clipper chain ADR-0023 resolves and caches per target.

Note a richer stabilization signature does **not** fix this. A child clipped to
nothing sits at a *stable* clipped state (null) for the whole slow-start of the
animation — its null-ness does not change frame to frame, only elapsed time
reveals it — so including a per-target null marker in the signature still
stabilizes early. The only honest signals are time (run the full window) or a
real resize event from the animating element. We take the latter.

**Decision.** The re-measure `ResizeObserver` observes, for every registered
Zone/Hover target, **the target node and every element in its clipping-ancestor
chain** (ADR-0023). An animating clipper — the Collapse wrapper revealing its
children — then resizes every frame, fires the observer, and funnels into the
same rAF-throttled settling burst as any other trigger (ADR-0026). Because each
fire re-extends the burst, it stays alive until the clipper stops animating and
the children, now visible, are measured into the Hover pass; then the burst
settles by the existing two-frame stability check. The fix is **purely
additive** — it widens the observed set and leaves ADR-0026's burst, its
stability early-out, and its frame cap untouched.

- **The clipper chain is already resolved and cached** (ADR-0023): `measureClipped`
  caches it per target on first measure. `observeTargets` resolves it eagerly for
  any newly registered target (so a target mounted mid-drag, ADR-0026, has its
  clippers watched at once) and observes node + chain. `observe` is idempotent,
  so shared ancestors — a common scroller above many siblings — dedupe to one
  observation, and re-running `observeTargets` on each registry change is a no-op
  for already-watched elements.
- **No feedback loop.** The Overlay is moved by an imperative per-frame
  `style.transform` write (ADR-0018), but the Overlay is portalled out and fixed
  (ADR-0010), so it resizes none of the targets' clippers. The
  `ResizeObserver` fires on box-size change only, which the transform write never
  causes — so this stays feedback-safe for the same reason ADR-0026 keeps the
  `MutationObserver` on `childList` only.

## Considered options

- **Run the full settle window on a registry change** (suppress the two-frame
  early-out, bounded by the frame cap) — rejected as the primary fix. Simpler (a
  flag on the burst), but it keys detection off a fixed frame budget rather than
  the real animation: an open longer than the cap (~333 ms at 20 frames) leaves
  the last node's children **never detected** (worse than ADR-0026's documented
  "drift" for shifted targets), and it pays a full-cap burst of
  `getBoundingClientRect` on every mid-drag mount even when nothing animates.
  Observing the clipper tracks the actual animating element, so it is
  duration-agnostic and silent for static mounts.
- **A richer stabilization signature** (a per-target null/clipped marker, or the
  raw pre-clip rect) — rejected. As above, a clipped-to-nothing target is stably
  null through the slow-start, and its raw rect is constant while a Collapse
  reveals it (only the clipper's box changes), so neither keeps the signature
  changing.
- **`transitionend` / `animationend` on the animating ancestor** — rejected, as
  in ADR-0026: CSS-only (no signal for a JS spring or content-load reveal) and it
  leaves the rects stale *during* the reveal, so a fast pointer entering a
  just-revealed child mid-transition still resolves against where it was. The
  burst, driven by the clipper's `ResizeObserver`, is animation-technology-
  agnostic because it watches the measured box, not the animation.

## Consequences

- **Closes the last-node spring-load gap** without touching the burst's shape:
  the stability early-out and frame cap (ADR-0026) and the clipped-rect collision
  contract (ADR-0023) are unchanged.
- **Steady-state cost stays zero.** A non-resizing clipper (a static or
  scrolled-out target) fires no observer, so observing the chain adds watched
  elements but no work until something actually resizes — unlike a fixed run-to-
  cap burst, which would re-measure regardless.
- **Bundle cost.** A small helper that resolves-and-observes the chain; kept
  within the ADR-0004 / ADR-0026 size budget (`main` ≤ 4.75 KB). The clipper
  chain is reused from ADR-0023, so no new geometry code ships.
- **Residual gaps, carried over from ADR-0026 rather than closed:**
  - An **infinitely animating clipper** near the drag re-fires the observer every
    frame and re-extends the burst indefinitely (steady-state re-measure). This is
    the same class ADR-0026 already carries for an infinitely-resizing *target*;
    this ADR widens the surface to clippers but adds no new hard ceiling, keeping
    parity with ADR-0026.
  - A reveal that is **not geometric** — opacity/visibility, which the rect model
    does not express (ADR-0023) — needs no fix here: such a child is never clipped
    to nothing, so it is measured in from the start.
