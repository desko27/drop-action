---
"drop-action": patch
---

`<SnapBack>` now sets `data-snapping` on its Overlay element while the Return bounce is animating (and not during a live drag), mirroring `<Item data-dragging>`. This lets a synthetic/E2E drag-retry loop tell a snap-back-in-progress apart from a live drag. The `snapping` flag was already on `useSnapBack()`; this just surfaces it on the DOM.
