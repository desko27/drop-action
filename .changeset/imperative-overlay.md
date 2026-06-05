---
"drop-action": major
---

The Overlay now moves **imperatively** and the store carries only low-frequency state, so a busy page no longer re-renders every Zone on every animation frame (ADR-0018). A new `useOverlay()` primitive returns `{ ref, style }` to spread onto the Overlay element; the engine writes its `translate3d` straight to the node each frame and never through React. `<Active>` and `<SnapBack>` are now thin sugar over it. The store emits only on transitions (drag start, status change, Over change, resolution), and each read (`useActive`, `useOver`, `useResolution`, `isDragging`) returns a referentially-stable value, so a consumer re-renders only when its own slice changes — an Over change re-renders just the two Zones whose membership flips.

**Breaking:** `transform` is removed from `ActiveSnapshot` / `useActive()` — the per-frame transform lives only in the engine now. Position a headless Overlay with `useOverlay()` instead of reading `active.transform`:

```tsx
// before
const active = DnD.useActive()
if (active) return <div style={{ position: 'fixed', transform: `translate3d(${active.originRect.left + active.transform.x}px, …)` }}>…</div>

// after
const active = DnD.useActive()
const { ref, style } = DnD.useOverlay()
if (active) return <div ref={ref} style={style}>…</div> // the engine moves it
```

**Breaking:** `createSnapBack` now also needs `useOverlay`: `createSnapBack({ useActive, useResolution, useOverlay })`.
