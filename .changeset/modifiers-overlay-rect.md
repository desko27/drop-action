---
"drop-action": minor
---

Modifiers now clamp against the measured Overlay, not the source Item (ADR-0020), extending ADR-0017's fix from collision to the modifier pipeline.

`restrictToWindowEdges` kept the *visible* Overlay inside the window by clamping the source Item's footprint — correct only while the Overlay matched the source's size. When they differ (e.g. a tall accordion-row source with a compact chip Overlay), the chip stuck before reaching the window edge and a larger Overlay overflowed past it. The clamp now uses the Overlay's own size, off the same measurement collision already shares (source-size fallback until the Overlay mounts).

**Breaking (`Modifier` contract).** `ModifierArgs.originRect` is replaced by `ModifierArgs.overlayRect`: the Overlay's footprint *at rest* (the source's origin position with the measured Overlay size). A custom modifier reading `originRect` must read `overlayRect`. Note it is the *resting* rect — collision's `overlayRect` is the *positioned* one (origin + post-modifier transform); a modifier produces that transform, so it sees the Overlay before it is applied. The built-in axis modifiers and `snapToGrid` are unaffected — they only touch `transform`.
