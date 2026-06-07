---
"drop-action": patch
---

Fix spring-load (`useDwell`) failing to detect children revealed by the **last**
node in a scroll list. The mid-drag settling burst (ADR-0026) now re-measures on
a resize of a target's **clipping ancestors**, not just the target node and the
document root (ADR-0031). When a node spring-opens, its children mount inside an
`overflow:hidden` ancestor (e.g. a MUI `Collapse`) that animates height 0 → auto:
the children are clipped to nothing (ADR-0023), keep their own size, and — for the
last node — shift no visible sibling, so the burst's stabilization stopped before
they were revealed and Dwell never fired. The `ResizeObserver` now also watches
each target's clipping-ancestor chain (already resolved per ADR-0023), so the
animating clipper keeps the burst alive until the children are revealed and
measured into the Hover pass. Purely additive: the burst's stability early-out
and frame cap are unchanged, and a static (non-resizing) clipper fires nothing,
so deep trees pay no extra work.
