# An active drag re-measures on DOM/layout change, via observers feeding a settling burst

_Extends ADR-0017 (live-tracked Zone rects) and ADR-0024 (core Dwell). ADR-0017
re-measured Zone/Hover rects only on `scroll`/`resize`; this adds three more
triggers — registry change, `ResizeObserver`, `MutationObserver` — and replaces
the single-shot re-measure with an adaptive **settling burst**, so a drag stays
accurate while the tree changes shape under it (spring-loaded folders, ADR-0024)._

ADR-0017 made Zone (and, via ADR-0024, Hover/Dwell) rects re-measure during the
drag instead of freezing at start, but wired the re-measure to `scroll` and
`resize` only — and flagged the gap itself: _"Zones that resize mid-drag with no
scroll/resize stay uncovered until a `ResizeObserver` is added."_ Dogfooding
`useDwell` as a spring-loaded folder in ORION hit exactly that gap, twice:

1. **Targets mounted mid-drag are not detected.** When a level spring-opens, its
   children mount and register new Hover/Dwell targets — but the rect snapshot
   only re-reads the registry on `scroll`/`resize`, and opening an accordion is
   neither. The just-revealed children never enter collision, so you cannot
   drill into them in the same drag.
2. **Shifted targets keep stale rects.** Opening an accordion pushes the targets
   below it down — a layout reflow, not a scroll/resize — so the re-measure never
   runs and Over/Dwell resolve against where the targets *were*, landing with an
   offset.

Both are the same hole: **the re-measure trigger set was too narrow.** (Note: the
per-id cache that survives across re-measures is only the *clipping-ancestor
chain* (ADR-0023), not the rect — `measureClipped` re-reads every rect fresh each
pass — so there is no stale-rect cache to invalidate; the fix is purely about
*when* a re-measure fires.)

**Decision.** An active drag re-measures on DOM and layout change, not just
scroll/resize, always-on (not a knob — ADR-0017's "correctness is not the
consumer's call"). All triggers funnel into one rAF-throttled **settling burst**:

- **Registry change.** The `useZone` / `useHover` ref callbacks already mutate the
  live registries; they now notify the engine, which (if a drag is live)
  re-observes the changed node and schedules a burst. This is the reliable signal
  for mounts/unmounts — it fires exactly when the `Map` changes, with no
  observer-vs-effect timing race. `items` are excluded: a source Item is not a
  collision target and its `originRect` is deliberately frozen for the gesture
  (ADR-0017).
- **`ResizeObserver`** (one instance) on every registered node — catching a target
  that resizes *in place* (ADR-0017's named gap) — plus `document.documentElement`,
  catching CSS-height / content-load growth that extends the page.
- **`MutationObserver`** (one instance) on `document.documentElement` with
  `childList` + `subtree`, catching structural reflow whose cause is *not* a
  registered target (a non-target banner/section expanding above the targets).

The burst replaces ADR-0017's single re-measure: it re-measures (and re-runs
`syncOver` / `syncHover`) each frame until the rects are stable for two
consecutive frames, with a hard frame cap that each new trigger re-extends. A
single re-measure would freeze an **animated** open at its near-start frame and
leave the rects drifting for the rest of the transition; the burst tracks the
animation to its settled position and is animation-technology-agnostic (CSS
transition, JS spring, content load) because it watches the measured rects, not
the animation.

## Why each trigger is independently necessary

The five triggers overlap on common cases (a registered target mounting fires
both the registry hook and the `MutationObserver`; a width resize fires both
`resize` and the root `ResizeObserver`) — but each holds a flank no other covers,
so none is redundant. All funnel into one rAF-throttled burst, so overlapping
fires deduplicate into a single re-measure; the overlap is defensive, not wasted
work.

- **`scroll`** — scrolling itself. A nested or page scroll moves Zones under the
  fixed Overlay while changing no element's *size* and mutating no DOM, so it is
  invisible to both observers. Nothing else fires on a scroll.
- **`resize`** — a window resize, notably a height resize with overflowing content,
  where `document.documentElement`'s measured size does not change (so the root
  `ResizeObserver` stays silent) yet `vh`/`fixed` Zones move. A cheap, guaranteed
  signal with a narrow flank of its own.
- **Registry change** — a target that (un)registers with **no DOM add/remove** (an
  `id` change reusing the same node), plus a **race-free** detection of the
  mounted-mid-drag case (bug 1, the headline) that does not rest on the
  observer-vs-React-commit microtask ordering. It is also where a newly registered
  node is handed to the `ResizeObserver`.
- **`ResizeObserver`** — an element resizing **in place with no DOM mutation** (a
  Zone whose own content/text grows; image/font-load growth) — ADR-0017's named
  gap. No `childList` change, so the `MutationObserver` is blind to it.
- **`MutationObserver` (`childList`)** — structural reflow caused by a
  **non-registered** element (a banner mounting DOM above the targets), especially
  inside a fixed-height scroller where it changes neither a registered node's size
  nor the document's. The registry hook never fires (nothing registered) and the
  `ResizeObserver` never observed that element.

The one mechanism this *replaces* is ADR-0017's single-shot re-measure: the burst
is the same re-measure done better (settling, not one frame), not added coverage.

## Considered options

- **`MutationObserver` with `attributes: true`** (to catch CSS-only-height
  toggles) — rejected. The Overlay is moved by an imperative `style.transform`
  write every frame (ADR-0018); an attribute observer would fire on each of those
  writes and re-measure every frame, reintroducing exactly the
  `getBoundingClientRect`-in-a-loop thrash ADR-0006/ADR-0017 avoid. `childList`
  only is feedback-safe; the `ResizeObserver` recovers most of what attributes
  would have caught, without the loop. Using attributes would require scoping the
  observed root to exclude the Overlay — new config, fragile.
- **`transitionend` to settle animations instead of a burst** — rejected. Cheaper,
  but CSS-only (no signal for a JS spring or a content-load reflow) and it leaves
  the rects stale *during* the animation, so a fast pointer entering the
  just-opened child mid-transition still lands offset.
- **Re-measure every frame (lazy, no snapshot)** — rejected, as in ADR-0006/0017.
  The burst confines the per-frame cost to a bounded window triggered by an actual
  change and self-terminating on stability; steady-state cost stays zero.
- **Defer the observers, fix only the registry hook + burst, document the rest** —
  rejected for an OSS library. The registry hook + burst alone fix ORION (a
  homogeneous tree where opening a level mounts registered children), but a
  consumer whose layout reflows from non-registered elements, or whose targets
  resize in place, would hit a drag that "feels broken" — the bar ADR-0017 says is
  not the consumer's call. The observers ship always-on.

## Consequences

- **Closes ADR-0017's named `ResizeObserver` gap** and supersedes its
  "scroll/resize only" trigger set. The single-winner contract (ADR-0006) and the
  measured-Overlay sizing (ADR-0017) are unchanged.
- **Zero added steady-state cost.** With no layout change, no observer fires (the
  per-frame Overlay write is an attribute the `childList` observer ignores and a
  no-op for size). The per-frame `flush` still does not re-measure; only a burst
  does, and a burst only runs on an actual change.
- **Bundle cost.** The settle burst plus the two observers push `main.cjs` over
  the `size-limit` budget, so the gate was raised 4.5 → 4.75 KB (ADR-0004).
  Accepted as the price of not feeling broken; the observers are created lazily on
  a real drag, so import and SSR stay DOM-free.
- **Residual gaps, documented rather than closed:**
  - A **CSS-only-height reflow by a non-registered element inside a fixed-height
    scroller** — no `childList` change, the moved targets do not self-resize, and
    the scroller does not change the document size — fires none of the triggers
    and stays offset until the next scroll/resize/registry change.
  - An **animation longer than the burst cap** settles at the cap-time position
    and drifts for the remainder; an infinite animation near a target is capped
    deliberately to avoid steady-state thrash.
- **Deep trees** pay O(targets) `getBoundingClientRect` per frame *during a burst*.
  Bounded and change-driven, but a future optimization could re-measure only the
  plausibly-near targets rather than all of them.
