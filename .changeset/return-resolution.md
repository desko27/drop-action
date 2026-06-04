---
"drop-action": major
---

Snap-back is now the Return animation, not the Reject-only one: it eases the Overlay home on every ending that is not an Accept — a Reject, a No-drop (released over no Zone), or a Cancel (Esc / pointercancel) — and leaves an Accept untouched, including an async Accept that previously bounced by accident (ADR-0013, CONTEXT.md). The core states the terminal outcome directly through a new `resolution` reactive read: `useResolution()` returns `{ outcome, originRect, transform, item }` where `outcome` is `'accepted' | 'rejected' | 'no-drop' | 'cancelled'`, emitted atomically as the Active goes null and kept until the next drag starts. `createSnapBack` now takes the two reads it needs — `createSnapBack({ useActive, useResolution })` — and `useSnapBack()` exposes `outcome` so consumers can vary treatment per Return (e.g. skip the bounce on a Cancel) while `<SnapBack>` keeps bouncing uniformly.
