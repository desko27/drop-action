# drop-action domain

Glossary of the terms used across the drop-action library, its docs, and
its agent skills. Terms here are project-specific drag-and-drop concepts;
general programming concepts (and React primitives) are excluded.

## Language

### Participants

**Drop Action**:
The drag-and-drop interaction returned by `createDropAction()` — a
channel component that carries the peer components (`Zone`, `Item`,
`Active`) and hooks as members (`DropAction.Zone`, `DropAction.useOver`, …).
It *is* the channel, not any one Zone or Item, and is not rendered itself.
One Drop Action is self-contained: only its own Items and Zones see each
other, so collision detection never leaks across Drop Actions.
_Avoid_: Context, DnD context, board, instance.

**Item**:
A draggable element registered in a Drop Action, carrying typed `data`.
The source Item stays in place during a drag; an Overlay travels with
the pointer instead. Identified by an `id`, so an Item is an `id` with
its `data`.
_Avoid_: Draggable, source, card.

**Zone**:
A droppable target region within a Drop Action, rendered as
`<DropAction.Zone id>` (its `id` is the `zoneId`). A single Drop Action
may render many Zones at once. Zone ids and Item ids live in separate
spaces, so a Zone and an Item may safely share an id.
_Avoid_: Droppable, target, area, slot.

**Overlay**:
The floating layer rendered at the pointer during a drag;
`<DropAction.Active>` renders into it. It is portalled to `document.body`
(overridable) and moved with a fixed-position transform. Because the
source Item never moves, the Overlay is the only thing the user sees
travel. Rendering an Overlay is **required**, not optional: headless means
the consumer supplies the Overlay's *content*, not that a drag may omit it
— a drag with no Overlay shows nothing travelling and is a broken use, not a
supported mode. So **Collision detection** always sizes against the Overlay,
never the source Item (ADR-0032).
_Avoid_: Ghost, clone, preview, drag image.

**Active**:
The Item currently being dragged — the one travelling. Its `{ id, data }` is
fixed at drag-start and stays stable for the whole flight (ADR-0027), read with
`useActive()` alongside the resolution `status`; it is rendered in flight by
`<DropAction.Active>` (which mounts into the Overlay). The naming holds the
relationship: the Active Item carries this data — the same value every reader
(reactive or imperative) sees until the drag ends.
_Avoid_: Dragging, current, selected, grabbed.

**Drag handle**:
The element that initiates a drag. By default the whole Item is its own
handle (via `useItem`'s `dragHandleProps`); with `customDragHandle` the
grabbable area narrows to wherever `useDragHandle(id)` is spread, which
may live outside the Item's subtree (a toolbar, a header). The handle
only triggers the drag; the Item is always what is measured and travels.
_Avoid_: Grip, knob, gripper.

**Grab anchor**:
The point on the Overlay that sits under the pointer while a drag is live —
the Overlay's relationship to the cursor. Distinct from the Drag handle
(where the press lands on the page): the handle starts the drag, the grab
anchor decides where the travelling Overlay hangs from the pointer. By
default it holds the same *relative* position on the Overlay that the press
had on the source (proportional), so when the Overlay matches the source the
pointer stays exactly where it was pressed, and when the Overlay is smaller
the pointer keeps the same fractional grip instead of falling outside it —
the pointer "grabbing the void". Configurable per Drop Action and per Item:
a fixed point (e.g. `center`), the source-absolute offset (`preserve`), or a
function. Assumes the press lands within the source's rect (the realistic
Drag handle, even a custom one, is an interior region); a spatially distant
handle is out of scope.
_Avoid_: Drag image offset, hotspot, pickup point, pivot.

**Hover target**:
An element registered in a Drop Action to detect when the drag is over it,
without ever being droppable — a Drop never lands on it. It lives in its own
registry, separate from Zones (its own id space, its own per-frame pointer
hit-test — always the cursor inside the target's clipped rect, never the
Overlay or the pluggable Collision detection), so a drag may **Hover** a Hover
target and be **Over** a Zone at the same time. Observed with
`useHover(id) → { ref, isHovering }`; at most one Hover target is the current
one per Drop Action. Timing how long the drag stays over it is **Dwell**'s job,
not the Hover target's.
_Avoid_: Watch target, drop target, sensor, dwell target (Dwell is the timed
behaviour, not the element).

### Drop resolution

**Drop**:
The moment an Item is released over a Zone. Distinct from a Drop Action
(the whole channel): a Drop is a single release event within one.
_Avoid_: Release, drop event (bare).

**Accept / Reject**:
The two outcomes of a Drop, decided by the Zone. Accept is explicit and
opt-in; not responding at all is still a Reject, so the no-op path stays
inert. Reject may also be stated explicitly — a self-documenting decline —
but an explicit Reject never overrides an Accept. Resolution may be
asynchronous: the Zone can await I/O before deciding. Either outcome may
carry a payload to the Item, which reacts via `onAccept` / `onReject`. A
Reject requires a Drop — a release over a Zone; a drag that never reaches a
Zone (No-drop, Cancel) is not a Reject.
_Avoid_: Approve/deny, allow/block, success/failure.

**No-drop**:
A release while no Zone is Over — a pointer-up landing on no target, so no
Drop occurs and no Zone decides. Like Cancel and unlike Reject, no Zone is
involved.
_Avoid_: Miss, reject, drop on nothing.

**Cancel**:
An in-flight drag aborted before any Drop — via Esc or pointercancel — so
no Zone is involved and no Drop occurs. Distinct from a Reject: a Reject is
a Zone's decision on a real Drop, whereas a Cancel never reaches a Zone.
_Avoid_: Abort, reject, escape.

**Return**:
The umbrella outcome of a drag that ends without an Accept — a Reject, a
No-drop, or a Cancel. In every Return the Active Item goes back to its
origin instead of landing; Snap-back is the animation of a Return. Accept
is the only non-Return outcome.
_Avoid_: Revert, cancel (Cancel is one kind of Return), snap-back (that is
the animation, not the outcome).

**Dropping**:
The pending phase between an Item's release and the Drop resolving
(Accept / Reject). The Active Item's `status` is `'dropping'` here, the
Overlay persists, and its origin rect stays available so consumers can
animate the outcome. Outside this phase a held Item's status is
`'dragging'`.
_Avoid_: Pending (bare), loading, settling, resolving.

### Collision

**Over**:
The single Zone the Active Item is currently judged to be over. At most
one Zone is Over at a time per Drop Action. Which Zone is Over is
resolved input-agnostically — by collision detection during a pointer
drag, or by a keyboard driver (by Zone index) once that module is
present. Read with `useOver(zoneId)`, which reports the Active
`{ id, data }` while that Zone is the Over one. Over is droppable-only and is
the sibling of **Hover**: a Hover target the drag sits over is resolved in a
separate pass and is Hovered, never Over.
_Avoid_: target, current zone; and Hover — that is the distinct observe-only
relationship (CONTEXT.md — Hover), not a synonym for Over.

**Hover**:
The single Hover target the drag's cursor is currently inside, per Drop
Action — the observe-only sibling of **Over**. Resolved by its own per-frame
pointer hit-test (the cursor within the target's clipped rect), separate from
the Zone collision pass, so it never affects Drop resolution and a drag may
Hover one target while Over a Zone. Read with `useHover(id)`, which returns
`isHovering`; timing a settled Hover is **Dwell**.
_Avoid_: Over (that is the droppable sibling), watch, mouseover.

**Collision detection**:
The pluggable strategy that picks which Zone (if any) is Over, given the
pointer, the Overlay rect (always the rendered Overlay's, never the source
Item's — ADR-0017, ADR-0032), and the Drop Action's Zone rects. Returns one
winning `zoneId` or `null`. Built-ins: `rectIntersection` (default),
`pointerWithin`, `closestCenter`.
_Avoid_: Hit testing, intersection (bare), collision (bare).

**Clipped rect**:
A Zone's rect after clipping to its visible region — the raw rect
intersected with the box of every clipping ancestor (`overflow`
scroll/auto/hidden/clip) and with the viewport. Distinct from the Zone's
raw rect (its full `getBoundingClientRect`): the clipped rect is what
collision detection tests against, so a part of a Zone scrolled out behind
an overflow ancestor cannot be Over.
_Avoid_: Visible rect (sounds like occlusion or CSS visibility), collision
rect (that is the Overlay's, ADR-0017).

**Modifier**:
A composable function that adjusts the Overlay's proposed `{ x, y }`
transform during a drag. Modifiers run left-to-right (each feeds the
next) and their result drives both what the user sees and what collision
detection tests against. Built-ins: `restrictToWindowEdges` (default),
`restrictToVerticalAxis`, `restrictToHorizontalAxis`, `snapToGrid(size)`.
_Avoid_: Constraint (that is the Activation constraint), transformer.

### Optional modules

**Extension**:
A first-party add-on injected into a Drop Action's namespace through
`createDropAction(options).extend(ext(), …)`, built only on the channel's public
members. Shipped as a tree-shakeable subpath module (ADR-0004), so a consumer
who never imports it bundles none of it; the core carries only a tiny generic
merge. Snap-back is an Extension; Dwell, by contrast, is **core** — its timer
needs the engine's per-frame pointer (ADR-0018), which an Extension cannot see —
a loop-bound behaviour stays in core (ADR-0028).
_Avoid_: Plugin, middleware, mixin, addon.

**Snap-back**:
The Return animation: it eases the Overlay back to its home — the Overlay
**centered on** the Item's origin rect (its live position at release) —
whenever a drag ends without an Accept (a Reject, a No-drop, or a Cancel).
Centering, rather than aligning the top-left corners, keeps an Overlay of a
different size from the source returning symmetrically into its slot. Not
part of the headless core — it ships as the opt-in subpath module
`drop-action/snap-back`, built on the resolution state and the home rect the
core exposes.
_Avoid_: Bounce-back, revert, reject animation (it is not Reject-only).

**Dwell**:
The drag *settling* over a Hover target — the cursor staying within
`tolerance` pixels for `dwellMs` continuously — which fires `onDwell(item)`
once and re-arms only after the drag leaves the target or moves off the settle
point. Read with `useDwell(id, { onDwell, dwellMs, tolerance }) → { ref, isDwelling }`.
The engine owns the timer (not the store, not the app): detecting "moved too
much inside the area" needs the per-frame pointer the store deliberately
withholds (ADR-0018), so Dwell is core alongside Hover — a sibling of the
Activation constraint's delay+tolerance gesture. The spring-loaded folder
(hover-to-expand on drag-over) is one use; tab-switch is another. Distinct from
**Auto-scroll**: Dwell is *settle*-driven (a still cursor for `dwellMs`),
Auto-scroll is *edge-proximity*-driven (continuous while the pointer sits near a
scrollport edge) — neither depends on the other.
_Avoid_: Hover (that is the immediate, untimed relationship — Dwell is the
*settled* one), spring-load (one use of it), long-press (that is pointer-down
timing), auto-scroll (that is the separate edge-proximity behaviour, CONTEXT.md
— Auto-scroll).

**Auto-scroll**:
Continuous scrolling of a **Scrollport** whenever the drag sits within a band
near one of its edges, at a speed that grows the deeper into the band it
reaches — the dnd-kit-style "drag to the edge and the list follows".
Edge-proximity-driven and untimed, the opposite of **Dwell** (settle-driven):
no cursor stillness is required, and it stops the instant the drag leaves the
band.
_Avoid_: Edge scroll, scroll region, drag-scroll, Dwell (that is the timed,
settle-driven sibling — Auto-scroll is the continuous, proximity-driven one).

**Scrollport**:
A scrollable container **Auto-scroll** can drive: an `overflow: scroll/auto`
ancestor the pointer is currently inside, plus the window (the document's
scrolling element) as the outermost, always-present one. Discovered
automatically — the same clipping ancestors a Zone's **Clipped rect** is built
from (those that can actually scroll, not `hidden`/`clip`) — never registered by
the consumer. When the pointer sits inside several nested ones, the innermost
scrolls first.
_Avoid_: Scroll container (bare), scroller, viewport, clipping ancestor (that is
the geometry term — a Scrollport is the subset Auto-scroll can move).

**Sortable**:
Reorderable-list behaviour — the auto-opening gap/placeholder showing
where a dragged Item will land within an ordered list. Anticipated as an
opt-in subpath module (like Snap-back), not part of the headless core.
_Avoid_: Reorder (bare), DnD list, sortable list.

**Keyboard module**:
Keyboard dragging (grab, move between Zones by arrow keys, drop, cancel)
plus screen-reader `aria-live` announcements. Opt-in subpath module; the
pointer-only core exposes an input-agnostic Over so this module needs no
engine changes.
_Avoid_: a11y module (bare), sensor.

### Input

**Activation guard**:
The eligibility check run on the initial pointer press — before the
pending-activation phase — deciding whether a press may become a drag at
all, from what it landed on and which button. Configured per Drop Action
(no per-Item override), with a default that refuses presses originating on
interactive content (form controls, editable text) and non-primary
buttons, so a click on a checkbox inside a whole-row Item never hijacks
into a drag. Distinct from the Activation constraint: the guard asks "is
this press eligible?" at press time; the constraint asks "did the gesture
cross the distance/delay threshold?" once eligible. A press the guard
refuses never enters the pending phase.
_Avoid_: Sensor, CustomPointerSensor, filter, shouldHandleEvent.

**Activation constraint**:
The threshold — movement distance and/or press delay — a pointer press
must cross before it becomes a drag, so clicks, taps and text selection
inside an Item are not hijacked. Configured once per Drop Action (no
per-Item override). Its default is pointer-type-aware: a small distance
for mouse/pen, a delay plus tolerance for touch, so touch lists stay
scrollable. Runs only after the Activation guard has let the press
through.
_Avoid_: Threshold (bare), tolerance, sensor delay.

## Relationships

- A **Drop Action** contains **Items** and **Zones**; only those
  belonging to the same Drop Action see each other.
- On a **Drop**, the **Zone** decides the outcome (**Accept** / **Reject**)
  and the **Item** reacts to that verdict via `onAccept` or `onReject`, each
  optionally carrying a payload. The decision lives on the Zone; the
  consequence lives on the Item.
- A drag ends in one of four terminal outcomes: **Accept** and **Reject**
  (the two outcomes of a **Drop**), or **No-drop** and **Cancel** (endings
  with no Drop and no Zone). The three non-Accept outcomes form a
  **Return**, which **Snap-back** animates.
- Exactly one **Item** is **Active** at a time across a Drop Action; the
  **Overlay** renders that Active Item until the Drop resolves.
- **Hover targets** are resolved in their own per-frame pointer pass, in
  parallel with Zones and never affecting Drop resolution — a drag may **Hover**
  one target while **Over** a Zone. **Dwell** times the drag settling over a
  Hover target and fires `onDwell`; its timer lives in the core engine because
  it needs the per-frame pointer. **Snap-back** is an **Extension** injected
  into the namespace.
