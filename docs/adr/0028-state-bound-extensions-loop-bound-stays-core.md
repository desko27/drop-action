# Only state-bound behaviour can be a pure Extension; loop-bound behaviour stays in core

A behaviour can ship as a pure Extension (ADR-0025) only if it is **state-bound** —
buildable on the channel's public, transition-only store (ADR-0018): `useActive`,
`useResolution`, `useOver`, `useOverlay`. Snap-back qualifies (it reads the
resolution and the home rect). A **loop-bound** behaviour — one needing the
per-frame pointer or the continuous re-measure the store deliberately withholds —
cannot. Hover/Dwell needs both (a per-frame pointer hit-test and the settling
re-measure burst, ADR-0024/ADR-0026), so it stays in core; ADR-0024 is reaffirmed,
not superseded.

This was litigated, not assumed: a spike measured what extracting Hover/Dwell
would actually buy, and it did not justify the mechanism.

## Considered options (the three ways to ship loop-bound code)

- **Pure Extension with its own listeners** — rejected. To get the per-frame
  pointer and keep its targets' rects fresh, the module would re-implement half
  the engine: a second `pointermove` + `rAF`, its own `ResizeObserver` /
  `MutationObserver` + settling burst (ADR-0026), and clipping (ADR-0023). Two
  loops run per drag, the module is fat, the core does **not** shrink (its
  apparatus stays for Zones), and a hover-using consumer pays twice.
- **An "Engine tap" seam** (a `host.registerTap/observe/requestRemeasure` handle
  passed to an Extension, letting it hook the live loop) — rejected. A spike
  (strip Hover/Dwell, rebuild, `size-limit`) measured **~0.39 KB gross /
  ~0.3 KB net** saved for a non-hover consumer, against a **permanent seam in the
  core** (the tap registry, the tap dispatch inside the burst/flush/cleanup, an
  `onRemeasure(): string` contributing to the burst's stability key) amortised
  over a **single client**. Hover/Dwell is the only loop-bound feature on the
  roadmap: Keyboard and Sortable are state-bound (input-agnostic Over, ADR-0011;
  "like Snap-back"), so they are pure Extensions, never tap clients. A new
  non-amortised mechanism superseding ADR-0024 is not worth ~0.3 KB.
- **Keep it in core** — chosen. ~0.4 KB that a non-hover consumer carries, in
  exchange for no new seam and one shared loop.

## Consequences

- **The criterion generalises.** Before adding a behaviour, ask: state-bound
  (→ Extension candidate) or loop-bound (→ core)? Every remaining core concern —
  collision detection, modifiers, grab-anchor, clipping, Hover/Dwell — is
  loop-bound, so none is a pure-Extension candidate. Snap-back was the only
  state-bound one and already ships as `drop-action/snap-back`. There is nothing
  left in the current API to extract.
- **The Extension system stays justified** independently of this: it is a tiny
  generic merge (ADR-0025) with a multi-client future (snap-back today; Keyboard,
  Sortable, user extensions — all state-bound) — unlike the Engine tap, whose only
  client would have been Hover/Dwell.
- **Revisit only if** a loop-bound feature gains a second independent client (then
  the Engine tap amortises — e.g. drag-region auto-scroll alongside Hover/Dwell),
  or if the size budget tightens enough that ~0.4 KB outweighs a permanent seam.
