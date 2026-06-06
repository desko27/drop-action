# Grab anchor: first-class engine config, proportional by default

_Refines ADR-0010, ADR-0017 and ADR-0020: the origin the Overlay anchors at —
for positioning, collision, and the modifier clamp — is now the **grab-anchored
origin**, not the source Item's top-left._

The Overlay is anchored at the source Item's top-left and moved by the raw
pointer delta, so the pointer keeps its **absolute pixel offset** from the
source's top-left for the whole drag. That offset is measured against the
*source*, but the Overlay that travels can be smaller (ADR-0017's chip-vs-row
case): grab the right edge of a 300px row whose Overlay is a 100px chip and the
pointer sits ~200px past the chip's edge — "grabbing the void" (CONTEXT.md —
Grab anchor).

We let the consumer control the **grab anchor**: the point on the Overlay that
sits under the pointer. It is **first-class config resolved in the engine**, not
a Modifier:

- A Modifier cannot see where the press landed or the source's size
  (`ModifierArgs` carries only `transform`, the resting `overlayRect`, the
  pointer and window dims — ADR-0007/0020), so `preserve` and `proportional`
  are inexpressible as Modifiers. Only a fixed anchor would be.
- A fixed-anchor Modifier would have to **override** the incoming transform
  rather than adjust it, breaking the left-to-right "each feeds the next" model
  (CONTEXT.md — Modifier) and turning the result order-sensitive.
- The grab anchor is a **drag-start baseline**, not a per-frame constraint — it
  belongs with `activationConstraint` / `shouldStart`, configured on the Drop
  Action, not in the transform pipeline.

In `beginDrag` the engine derives the Overlay's **anchored origin** —
`grab − fraction · overlaySize`, frozen at start — and uses it wherever the
source top-left was hardcoded: `placeOverlay`, the modifier resting
`overlayRect`, and the collision `overlayRect`. Because render, Over and
`restrictToWindowEdges` all read that one origin, they track the anchored
Overlay **for free**; the `transform` stays the raw delta (still 0 at start, no
jump in transform terms — the reposition lives in the origin). This refines what
"the Overlay anchors at `originRect`" (ADR-0010) and "`overlayRect` at rest"
(ADR-0020) mean: both now mean the anchored origin.

**The default is `proportional`** — the pointer holds the same *fractional* grip
on the Overlay that it had on the source. It is byte-for-byte identical to the
old absolute behaviour when Overlay == source (the common case), and removes the
void when the Overlay is smaller. The void "feels broken", and per ADR-0017's
precedent (scroll-drift re-measure is always-on, not a knob) the fix ships as
the default, not an opt-in. This assumes the press lands **within** the source's
rect, so the grab fraction stays in `[0,1]` and the anchor never falls outside
the Overlay; the realistic Drag handle, even a custom one, is an interior region
(CONTEXT.md — Drag handle), so a spatially distant handle is out of scope and
needs no clamping.

Public surface:

```ts
export const center: GrabAnchorPoint = { x: 0.5, y: 0.5 }
type GrabAnchorPoint = { x: number; y: number } // fraction of the Overlay
type GrabAnchorArgs = {
  originRect: Rect
  overlaySize: { width: number; height: number }
  grab: { x: number; y: number } // the press point (startX, startY)
}
type GrabAnchor =
  | 'proportional' // default
  | 'preserve'
  | GrabAnchorPoint
  | ((args: GrabAnchorArgs) => GrabAnchorPoint)
```

- Configured per Drop Action (`createDropAction({ grabAnchor })`) with a
  per-Item override (`useItem(id, { grabAnchor })`); resolved
  `item ?? action ?? 'proportional'`.
- Resolved at start and re-resolved **once** when the Overlay first measures
  (the same fallback-to-source-size moment as `resolveOverlaySize`), never per
  frame — so a user function is not called at 60fps.
- The returned fraction is not clamped: a value outside `[0,1]` deliberately
  places the anchor outside the Overlay (the consumer's explicit choice).

## Considered options

- **A built-in Modifier (`anchorToPointer`)** — rejected. Cannot express
  `preserve` / `proportional` (no grab point or source size in `ModifierArgs`),
  must override rather than compose, and is order-sensitive. The grab anchor is
  a start-time baseline, not a per-frame transform adjuster.
- **Keep `preserve` (absolute offset) as the default** — rejected. It leaves the
  void. `proportional` is identical when Overlay == source, so switching costs
  nothing in the common case and fixes the broken one; `preserve` stays as an
  opt-in for consumers who want pixel-exact alignment (and accept the void).
- **Per-Drop-Action only, no per-Item override** — rejected. The void is
  Item-specific (some Items have small Overlays), and a fixed anchor like
  `center` should target only those Items, not re-anchor the matching ones. This
  is the first per-Item override in the library: the per-action-only rule of
  ADR-0012/0016 guards the *gesture model* (uniform by design); the grab anchor
  tracks *Overlay presentation*, which is inherently per-Item, so the rule's
  rationale does not apply.
- **A `clamp` policy, or clamping the fraction to `[0,1]`** — rejected. It only
  earned its keep for a spatially distant custom handle, which is not a real use
  case. For in-source grabs `proportional` already never voids, so a clamp is
  dead code dressed as a feature.
- **Engine support for smoothing the start jump** of a fixed anchor — deferred.
  A `center` anchor repositions the Overlay under the pointer on grab; with a
  continuation-style Overlay that reads as a jump, and the consumer cannot smooth
  it (the engine writes `transform` imperatively each frame — ADR-0018). v1
  ships the jump instant and documented; the `proportional` default avoids it for
  the continuation case. An "animate initial anchor" option can come later.

## Consequences

- Breaking, pre-1.0: new `grabAnchor` option on the Drop Action and on
  `useItem`; `center` is exported. Default behaviour changes **only** when the
  Overlay's size differs from the source (`proportional` vs the old absolute
  offset).
- `ModifierArgs.overlayRect` "at rest" now means the anchored origin, not the
  source origin (refines ADR-0020). No built-in modifier changes — they either
  ignore the rect (axis, `snapToGrid`) or clamp it (`restrictToWindowEdges`),
  and clamping the anchored rect is exactly right.
