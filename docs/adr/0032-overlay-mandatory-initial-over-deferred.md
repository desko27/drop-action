# The Overlay is mandatory; collision is always Overlay-sized and the initial Over is deferred to the Overlay's registration

_Refines ADR-0017 (collision sized from the measured Overlay, with a source-rect
fallback "when no Overlay is rendered") and ADR-0007 (collision runs against the
Overlay rect). ADR-0017 kept the source rect as collision's fallback and emitted
the **initial** Over from it at drag-start, because the Overlay node mounts a
frame later; this removes the source rect from collision and defers the initial
Over instead._

ADR-0017 sized collision from the measured Overlay but, "with no Overlay
rendered," fell back to the source-translated rect — and the **initial** Over
(the one published at drag-start, in the engine's `beginDrag`) was computed from
that fallback, because React has not yet mounted the Overlay portal when the
drag begins. When the Overlay differs in size from the source — the very case
ADR-0017 set out to fix, a tall accordion-row source vs a compact chip Overlay —
the initial Over is computed on the *source* footprint, paints, and only corrects
once the Overlay mounts and the rAF settling burst (ADR-0026) re-measures, which
happens **after** a paint. The result is a one-frame flash of `isOver` on a Zone
the Overlay never actually covers.

**The premise that justified the fallback does not hold.** ADR-0017 treated "no
Overlay rendered" as a supported mode and rejected requiring an Overlay. But the
library renders nothing visual on the consumer's behalf — it clones no source
Item — so a drag with no Overlay shows *nothing travelling*. That is a broken
use, not a mode. Headless means the consumer supplies the Overlay's *content*,
not that the Overlay is optional. So the Overlay is **mandatory** (it cannot be
runtime-verified, and we do not try to), and collision is **always** sized from
the Overlay, never the source.

**Decision.** The **initial** Over no longer reads the source-Item size, and in
supported usage (an Overlay is always rendered) collision is always Overlay-sized.
At drag-start the engine commits `active` (so the Overlay can mount) with
`over = null`, and runs the **first** collision pass only when the Overlay node
registers via `useOverlay` (where it is measured, ADR-0017 / ADR-0018) — emitting
the single `null → Zone` Over transition there. Because the registration callback
fires in React's commit phase, before paint, the corrected Over lands on the
first painted frame; if a React version defers that emit, the degradation is a
benign one-frame "no Zone Over" (never a wrong Zone) — itself part of why this
was chosen over the alternative below.

The source rect's remaining roles are both invisible: the frame-0 fallback for the
transform / modifier clamp (`restrictToWindowEdges` needs *a* rect before the
Overlay is measured, corrected on mount), and — only on a drag that renders **no**
Overlay, a broken use (CONTEXT.md — Overlay) — the per-move collision fallback.
Neither is the initial Over, and neither is reachable in supported usage.

## Considered options

- **Keep emitting the source-sized initial Over, but correct it before paint** —
  recompute Over synchronously in the Overlay-registration callback instead of
  waiting for the rAF burst. Rejected. It still writes a wrong Over into the
  store and merely races to overwrite it: if the correcting emit misses the
  pre-paint window it paints a *wrong-Zone* highlight (the original bug).
  Deferring never stores a wrong value, collapses the differing-size case from
  two transitions (`null → source-Zone → Overlay-Zone`) to one
  (`null → Overlay-Zone`), and degrades to a benign "no highlight" rather than a
  wrong one.
- **A timeout to distinguish "Overlay coming" from "headless, no Overlay"** —
  moot once the Overlay is mandatory. There is no legitimate no-Overlay case to
  fall back for, so the first collision pass simply waits for the registration
  with no deadline.

## Consequences

- **Reverses ADR-0017's source-rect collision fallback.** The rest of 0017 —
  live re-measure against scroll, Overlay-sized collision — stands and is
  reinforced. **Sharpens ADR-0007**: "the Overlay rect" is now *always* the
  rendered Overlay's, with no source-sized path into collision.
- `useOver` reports `null` during the unavoidable pre-mount frame; consumers that
  key off the drag-start Over see one clean `null → Zone` transition. `onDrop` is
  unaffected — it recomputes Over fresh at release. Hover is unaffected: a
  pointer-only hit-test independent of the Overlay (CONTEXT.md — Hover).
- The contract — the initial Over reads the Overlay, not the source footprint —
  is covered by a unit test (Overlay smaller than the source, a Zone the source
  would overlap but the Overlay does not; Over stays `null`). The *no-flash*
  property additionally depends on the registration emit flushing before paint,
  which a DOM-only test (no paint) cannot assert; it is a runtime characteristic,
  and its failure mode is the benign one-frame "no Over" described above, not a
  wrong Zone.
