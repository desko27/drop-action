# Pointer Events as the drag engine

drop-action ships zero runtime dependencies but must reproduce a
dnd-kit-style API surface — an Overlay, pluggable collision detection,
and modifiers — all of which operate on pointer coordinates. We build a
custom engine on the Pointer Events API: a single unified stream
(`pointerdown` / `pointermove` / `pointerup` with `setPointerCapture`)
that covers mouse, touch and pen, gated by a configurable activation
constraint so presses are not mistaken for drags.

## Considered options

- **Native HTML5 Drag and Drop** (`draggable` / `ondrop`) — rejected.
  No stylable Overlay (only the browser's non-customisable drag image),
  poor-to-broken touch support, and an event model that does not expose
  the live pointer coordinates that coordinate-based collision detection
  and modifiers require. It would not reproduce the target API.
- **Separate mouse + touch listeners** — rejected. Duplicates logic that
  Pointer Events already unifies, widening the bug surface for no gain.
