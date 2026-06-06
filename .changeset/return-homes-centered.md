---
"drop-action": major
---

The Return now homes the Overlay **centered** on the source's rect instead of aligning their top-left corners (ADR-0022), so a size-mismatched Overlay — or one lifted with a `grabAnchor` — eases back into the middle of its slot rather than to the source's corner. Identical when the Overlay matches the source's size.

**Breaking (`resolution` contract).** `Resolution.originRect` is renamed `homeRect` and redefined as the **Overlay's** home — its measured size, centered on the source's live rect — read via `useResolution()`. A Return still eases from `homeRect + transform` to `homeRect`. `<SnapBack>` / `useSnapBack` consumers are unaffected; a consumer reading `useResolution().originRect` directly must read `homeRect` (and note its `width` / `height` are now the Overlay's, its position centered on the source).
