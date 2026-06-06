---
"drop-action": minor
---

Collision now tracks scroll and uses the real Overlay's footprint (ADR-0017), fixing two issues found dogfooding:

- **Scrolling mid-drag no longer drifts Over off the visible Zones.** Zone rects are re-measured on `scroll` (capture phase, so nested scroll containers count) and `resize`, rAF-throttled — always on, not a knob. The source origin stays frozen (the Overlay is `position: fixed` and tracks the pointer), so there is no per-`pointermove` cost; Over is recomputed but only re-emitted when it actually changes.
- **Collision is sized from the measured Overlay, not the source Item.** When the Overlay differs in size from the source (e.g. a tall accordion-row source with a compact chip Overlay), Over now matches the Overlay the user actually sees, not the source's footprint. The `Measure` boundary gains a `type: 'overlay'` target; a `measure` that ignores `type` treats it like an Item, so existing measures keep working.

The default detector is unchanged (`rectIntersection`): `pointerWithin` follows the raw pointer and would diverge from a modifier-constrained Overlay, so it stays opt-in per Drop Action.
