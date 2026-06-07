---
"drop-action": minor
---

The Active Item's `{ id, data }` is now snapshotted at drag-start and stays stable for the whole flight (ADR-0027). Every reader — reactive (`useActive` / `useOver`) and imperative (`onDrop` / `onAccept` / `onReject` / `onDwell`) — sees the same frozen value, closing a silent asymmetry where the imperative paths reread the live data at release/fire time while the reactive paths stayed frozen at drag-start.

Only `data` / `id` are frozen — geometry stays live (Zones re-measured, ADR-0017; the Return re-homes on the live source, ADR-0022) and `status` still transitions `dragging → dropping`.

**Behaviour change (pre-1.0):** `onDrop` / `onAccept` / `onReject` / `onDwell` now receive the drag-start `data`, not the value live at release/fire time. A consumer mutating an Item's `data` mid-drag will no longer see it reflected at the Drop. Supporting mutable data is additive if a real need ever appears (re-commit `active` on change).
