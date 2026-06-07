---
"drop-action": major
---

Add **Hover targets** and **Dwell** (spring-loading), and an **Extensions** mechanism for injecting opt-in modules under the namespace (ADR-0024, ADR-0025, CONTEXT.md).

**New — `useHover` / `useDwell` (core):** observe-only over-detection for arbitrary elements during a drag. Because `setPointerCapture` kills DOM `hover` mid-drag, the engine is the only reliable source of "the cursor is over element X" — so this lives in the core.

- `useHover(id) → { ref, isHovering }` — `isHovering` is true while the drag's cursor is inside the element. A **drop never lands** on a hover target and it never affects drop resolution (its own pointer pass, its own registry), so it can freely overlap a zone.
- `useDwell(id, { onDwell, dwellMs = 500, tolerance = 8 }) → { ref, isDwelling }` — `onDwell` fires once the cursor **settles** over the element (stays within `tolerance` px for `dwellMs` ms), re-arming only after the drag leaves or moves off the settle point. The timer lives in the engine because cursor-stability needs the per-frame pointer the store withholds (ADR-0018). The building block for spring-loaded folders (hover-to-expand on drag-over); `useHover` is the raw signal for auto-scroll regions, tab-switch, etc.

**New — Extensions via `.extend(...)`:** opt-in modules now inject under the channel namespace.

```tsx
const DnD = createDropAction<Card>().extend(snapBack<Card>())
// → DnD.SnapBack, DnD.useSnapBack
```

`.extend` is a method (not a second `createDropAction` argument) so the Extension types stay inferred even when `Data` is fixed explicitly.

**Breaking — snap-back is now an Extension:** `createSnapBack(reads, options)` is removed. Migrate to the `snapBack(options)` Extension:

```tsx
// before
import { createSnapBack } from 'drop-action/snap-back'
const { SnapBack } = createSnapBack({
  useActive: DnD.useActive,
  useResolution: DnD.useResolution,
  useOverlay: DnD.useOverlay,
})

// after — inject under the namespace
import { snapBack } from 'drop-action/snap-back'
const DnD = createDropAction<Card>().extend(snapBack<Card>())
// …or apply by hand: const { SnapBack } = snapBack<Card>()(DnD)
```

The core size budget rises to 4.5 KB (min+brotli) to fit hover/dwell.
