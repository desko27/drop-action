---
"drop-action": minor
---

Add `useDropEvent(zoneId, (item, respond) => …)` so a Drop can be handled far
from where its Zone is rendered. Drop handling is now a per-zoneId
subscription: many listeners may share a zoneId, and a Drop fires them all
with `respond('accepted')` idempotent (first accept wins). The `Zone`'s
`onDrop` is now optional and implemented as sugar over `useDropEvent`, so a
Zone stays measurable for collision even when its only drop handler lives
remotely.
