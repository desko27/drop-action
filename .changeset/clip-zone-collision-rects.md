---
"drop-action": minor
---

Collision now tests against each Zone's **visible** region, fixing Over firing from a part of a Zone scrolled out of view (ADR-0023).

- **A Zone inside an `overflow` scroll/auto/hidden/clip container only collides where it is actually visible.** The engine clips each Zone's rect to its clipping ancestors' boxes (and the viewport) before collision, so the half scrolled out behind the container's edge can no longer be Over. Previously `getBoundingClientRect` reported the full rect, so the dragged Item activated the Zone from a region the user could not see.
- **A Zone clipped to nothing drops out of collision entirely**, under every detector — including `closestCenter`, which has no overlap requirement and would otherwise hand Over to a fully-hidden Zone's center. The exclusion is re-applied on each scroll/resize re-measure, so a Zone scrolled back into view re-enters and becomes Over-able again.

The clip lives in the engine's Zone-measuring loop; the `Measure` strategy still returns raw geometry and the collision detectors stay pure, so custom detectors inherit clipping for free and never see a hidden Zone. The clipping-ancestor chain is resolved once per Zone at drag start and cached, so the per-re-measure cost stays in the same order as ADR-0017. Occlusion by elements painted on top is out of scope — only geometric clipping is handled.
