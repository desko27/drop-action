---
"drop-action": minor
---

Pointer-type-aware activation constraint (touch lists stay scrollable). A
press no longer becomes a drag immediately: the engine opens a pending
phase gated by a configurable `activationConstraint` on `createDropAction`.
Mouse and pen activate on a small distance (4px default) for a near-instant
drag; touch activates only on a press-and-hold (250ms within a 5px
tolerance), so a quick swipe scrolls a list instead of dragging. The
constraint is data plus a pure `evaluateActivation` evaluator (unit-tested
across pointer types). `touch-action: none` is now applied only while a
drag is actually under way, so touch scrolling survives until activation.
Exports new public types: `ActivationConstraint`, `DistanceActivation`,
`DelayActivation`, `PointerKind`.
