---
"drop-action": minor
---

Add a **grab anchor** — where the travelling Overlay hangs from the pointer (ADR-0021, CONTEXT.md). When the Overlay is smaller than the source Item the pointer could end up "grabbing the void" past the edge of the visible Overlay, because the grab offset was measured against the source. `grabAnchor` controls which point of the Overlay sits under the pointer.

The default is now `'proportional'`: the pointer keeps the same *fractional* grip on the Overlay it had on the source — identical to the old absolute offset when the Overlay matches the source's size, and free of the void when it is smaller. Set it on the Drop Action (`createDropAction({ grabAnchor })`) or override per Item (`useItem(id, { grabAnchor })`, `<Item grabAnchor>`), resolving Item → Drop Action → `'proportional'`. Values:

- `'proportional'` (default)
- `'preserve'` — the old source-absolute pixel offset
- a fixed `{ x, y }` as a fraction of the Overlay — `center` (exported, sugar for `{ x: 0.5, y: 0.5 }`) pins the Overlay's middle under the pointer
- `(args) => ({ x, y })` for full control, given the source rect, the measured Overlay size, and the grab point

**Behaviour change:** only observable when the Overlay's size differs from the source (`'proportional'` vs the old absolute offset). Pass `grabAnchor: 'preserve'` to restore the previous behaviour.
