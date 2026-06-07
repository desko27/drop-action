---
"drop-action": minor
---

The initial Over no longer flashes the source footprint at drag-start (ADR-0032). Collision is always sized from the Overlay — which is now mandatory by contract (headless means you supply the Overlay's _content_, not that a drag may omit it), reversing ADR-0017's "no Overlay rendered → source rect" fallback for collision.

At drag-start `over` is held `null` and the first collision pass runs when the Overlay node registers via `useOverlay` (where it is measured), in the commit phase before paint. Previously, when the Overlay differed in size from the source, the initial Over was computed on the source's footprint and could light up a Zone the Overlay never covers for one frame before correcting on the rAF settle burst. The deferred pass never stores a wrong value: a drag that begins over a Zone resolves in a single `null → Zone` transition.

Hover is unaffected (a pointer-only hit-test, independent of the Overlay), and `onDrop` is unaffected (it recomputes Over fresh at release).
