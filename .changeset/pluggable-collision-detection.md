---
"drop-action": minor
---

Pluggable collision detection. `createDropAction` now accepts a
`collisionDetection` option (defaulting to `rectIntersection`) of shape
`(args: { pointer, overlayRect, zones }) => zoneId | null`, returning the
single winning Zone. Ships three tree-shakeable built-ins —
`rectIntersection`, `pointerWithin`, and `closestCenter` — alongside the
`CollisionDetection`, `CollisionArgs`, and `ZoneRect` types. A custom
detector can be supplied, and a Drop Action with many Zones routes each Drop
to the Zone the detector selects (scoped to its own Zones).
