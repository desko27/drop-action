---
"drop-action": minor
---

Add **auto-scroll** as the opt-in subpath module `drop-action/auto-scroll` (ADR-0033, CONTEXT.md). dnd-kit-style edge-proximity scrolling: while a drag's pointer sits in a band near a scroll container's edge, that container scrolls continuously, faster the deeper into the band — innermost scroller first, the window as the outermost, with fall-through to the next outer one when the inner hits its limit.

Enabling it is `.extend(autoScroll())` and nothing else — it injects **no** namespace members and the consumer mounts nothing:

```tsx
import { createDropAction } from 'drop-action'
import { autoScroll } from 'drop-action/auto-scroll'

const DnD = createDropAction<Card>().extend(autoScroll<Card>())
// render <DnD.Active> as usual — auto-scroll just works during drags
```

Options: `threshold` (band size as a fraction of the scroller per axis, default `0.2`), `speed` (max px/s, default `1500`), `acceleration` (depth→speed exponent, default `1` = linear). To disable it, drop the extension.

**New (core) — drag-time hook seam:** the channel now runs Extension-registered hooks from the Overlay's render while a drag is live, so a behaviour Extension can run zero-mount. This is what lets `.extend(autoScroll())` work with no `<AutoScroll>` component or hook to mount. The slot is tiny and generic; extensions must register at setup (synchronously, before the first render) so the Rules of Hooks hold. Tree-shakeable: a consumer who never imports `drop-action/auto-scroll` ships none of it.

Auto-scroll is loop-bound only on the **pointer** (it adds its own `pointermove`), not on the core's re-measure apparatus — scrolling fires `scroll`, which the core already turns into its settling burst (ADR-0026), so the Over zone tracks the moving list for free. This corrects ADR-0028's prediction that auto-scroll would justify the heavier "Engine tap" seam.
