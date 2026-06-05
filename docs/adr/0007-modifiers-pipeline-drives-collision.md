# Modifiers are a composable transform pipeline that also drives collision

_Refined by ADR-0017: the "post-modifier Overlay rect" collision tests against is
now the **measured** Overlay's footprint anchored at origin + transform, not the
source Item's rect translated (which only matched while Overlay and source were
the same size). The principle below — Over matches what the user sees travel —
is what that refinement upholds._

Modifiers are composable functions `(args) => Transform`, where Transform
is an `{ x, y }` delta from the drag start. The array is applied
left-to-right — each modifier's output feeds the next — and the final
value becomes the Overlay's CSS transform. Built-ins ship tree-shakeable:
`restrictToWindowEdges` (default), `restrictToVerticalAxis`,
`restrictToHorizontalAxis`, and the factory `snapToGrid(size)`.

The decision that matters: collision detection runs against the
**post-modifier** Overlay rect, not the raw pointer. So Over always
matches what the user sees travel — a Overlay constrained to one axis or
pinned to a window edge cannot register Over somewhere it visually cannot
reach.

## Considered options

- **Modifiers affect only the visual transform; collision uses the raw
  pointer** — rejected. Over would diverge from the visible Overlay,
  which is surprising precisely with the common modifiers
  (`restrictToVerticalAxis`, `restrictToWindowEdges`).
- **Ship `restrictToParentElement` / scrollable-ancestor modifiers** —
  deferred. They need a container ref and extra measurement; not v1.

## Consequences

The per-frame pipeline is fixed: modifiers → Overlay transform →
post-modifier Overlay rect → collision detection, all throttled to an
animation frame.
