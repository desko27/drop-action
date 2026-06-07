---
"drop-action": patch
---

**Fix:** a Drop Action now enforces a single in-flight drag (ADR-0029). A second concurrent `startDrag` is ignored, which closes two issues:

- A default `<Item>` (no `customDragHandle`) that wraps a `useDragHandle(id)` element no longer fires the Zone's `onDrop` — and the Item's `onAccept` / `onReject` — twice per Drop. One press previously called `startDrag` twice (the inner trigger plus the bubbled wrapper trigger).
- Multi-pointer simultaneous drag within one Drop Action is explicitly out of scope: a second finger no longer spins up an incoherent second drag against the single Active / Overlay state.

Concurrency across separate Drop Actions is unaffected — each is closure-isolated with its own engine.
