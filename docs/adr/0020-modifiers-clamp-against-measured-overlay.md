# Modifiers clamp against the measured Overlay rect, not the source

_Extends ADR-0017's "measured Overlay, not source" principle from the collision
rect to the modifier pipeline._

A Modifier's job is to constrain what the user sees travel — the Overlay
(ADR-0007). But the pipeline fed each Modifier the **source Item's** rect
(`originRect`), frozen at drag start. `restrictToWindowEdges` clamped the
trailing edge with `originRect.right` / `originRect.bottom` — the source's
width and height — so when the Overlay and source differ in size (a tall
accordion-row source vs a compact chip Overlay, ADR-0017's own example) the
clamp tracked the invisible source footprint, not the visible Overlay: the chip
stuck before reaching the window edge, and a larger Overlay overflowed past it.
This is the exact latent bug ADR-0017 fixed for collision, surviving in the
modifier path because the two carried separate rects.

`ModifierArgs` now exposes `overlayRect` in place of `originRect`: the Overlay's
footprint **at rest** — the source's origin position (`originRect.left/top`)
with the **measured Overlay size**, falling back to the source size while no
Overlay is mounted (the same fallback, off the same shared `overlaySize`
measurement, that collision uses). `restrictToWindowEdges` is unchanged but for
reading `overlayRect`; its leading-edge clamps (`minX` / `minY`) were already
correct — the Overlay is anchored at the source's origin — so only the
trailing-edge clamps, which carry the size, needed the switch.

The subtle, deliberate part: `overlayRect` means the Overlay **at rest**
(pre-transform) in `ModifierArgs`, but the Overlay **positioned** (origin +
post-modifier transform) in `CollisionArgs`. The arithmetic forces it — a
Modifier *produces* the transform, so `minX = -overlayRect.left` only holds if
the transform it is about to add has not already been folded in. The two are the
same footprint seen at different stages of one frame: the Modifier sees it
before deciding the transform, collision after. Collapsing the two names to a
single meaning would reintroduce double-counting of the transform.

## Considered options

- **Keep `originRect` and add `overlayRect` / `overlaySize` alongside** —
  rejected. A Modifier constrains the visible Overlay; there is no legitimate
  case for clamping against the invisible source. Two near-identical rects in
  the contract only invite reaching for the wrong one. Pre-1.0, so replacing the
  public field outright is acceptable.
- **Give `ModifierArgs.overlayRect` the positioned meaning it has in collision,
  and have Modifiers subtract the transform themselves** — rejected. It pushes
  the double-counting hazard onto every Modifier author for no gain; the resting
  rect is the frame each Modifier actually needs.
- **Freeze the clamp basis on the source for the whole gesture to avoid the
  one-frame basis change when the Overlay first measures** — rejected. It
  diverges from collision's fallback for an imperceptible single frame and
  re-splits the rect the two paths now share.

## Consequences

- `Modifier` / `ModifierArgs` is a breaking contract change: a custom modifier
  reading `originRect` must read `overlayRect`. Acceptable in the pre-1.0 phase;
  called out in the changeset.
- The built-in axis modifiers and `snapToGrid` are unaffected — they only touch
  `transform`, never the rect.
- Future rect-aware modifiers (the deferred `restrictToParentElement`, ADR-0007)
  inherit the Overlay-based rect for free.
