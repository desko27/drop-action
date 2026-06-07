---
"drop-action": minor
---

An active drag now re-measures on DOM and layout change, not just `scroll`/`resize` (ADR-0026) — completing `useDwell` (ADR-0024) so spring-loaded folders keep working as the tree changes shape mid-drag. Found dogfooding: dwelling over a level auto-expands it, but the drag then went stale.

- **Targets that mount mid-drag are detected at once.** When a level spring-opens and its children register new Zones / Hover-Dwell targets, the registry re-measures immediately, so you can drill into the just-revealed children in the same drag instead of waiting for a scroll.
- **Targets shifted by a reflow are hit at their new position.** Opening an accordion pushes the targets below it down — a layout reflow, not a scroll/resize. A `ResizeObserver` (per target + the document root) and a `childList` `MutationObserver` now drive re-measurement, so Over / Dwell resolve against where targets *are*, not where they were.
- **Animated opens settle correctly.** Re-measurement is a short **settling burst** — it re-reads each frame until the rects hold steady (with a hard cap), so an animated expand lands on its final layout rather than freezing at the near-start frame. It is animation-agnostic and self-terminating; steady-state cost stays zero (a burst runs only on an actual change, never per pointer frame).

The `MutationObserver` watches `childList` only — never `attributes` — so the Overlay's per-frame transform writes can't feed back into a re-measure loop. The observers are created lazily on a real drag, so import and SSR stay DOM-free.

Known gaps (documented, not closed): a CSS-only-height reflow by a non-registered element inside a fixed-height scroller, and animation beyond the burst cap. The core size budget rises to 4.75 KB (min+brotli) to fit the observers.
