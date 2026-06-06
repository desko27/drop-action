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
travel.
_Avoid_: Ghost, clone, preview, drag image.

**Active**:
The Item currently being dragged — the one travelling. Its `{ id, data }`
and resolution `status` are read with `useActive()`, and it is rendered
in flight by `<DropAction.Active>` (which mounts into the Overlay). The
naming holds the relationship: the Active Item carries this data.
_Avoid_: Dragging, current, selected, grabbed.

**Drag handle**:
The element that initiates a drag. By default the whole Item is its own
handle (via `useItem`'s `dragHandleProps`); with `customDragHandle` the
grabbable area narrows to wherever `useDragHandle(id)` is spread, which
may live outside the Item's subtree (a toolbar, a header). The handle
only triggers the drag; the Item is always what is measured and travels.
_Avoid_: Grip, knob, gripper.

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
`{ id, data }` while that Zone is the Over one.
_Avoid_: Hover, target, current zone.

**Collision detection**:
The pluggable strategy that picks which Zone (if any) is Over, given the
pointer, the Overlay rect, and the Drop Action's Zone rects. Returns one
winning `zoneId` or `null`. Built-ins: `rectIntersection` (default),
`pointerWithin`, `closestCenter`.
_Avoid_: Hit testing, intersection (bare), collision (bare).

**Modifier**:
A composable function that adjusts the Overlay's proposed `{ x, y }`
transform during a drag. Modifiers run left-to-right (each feeds the
next) and their result drives both what the user sees and what collision
detection tests against. Built-ins: `restrictToWindowEdges` (default),
`restrictToVerticalAxis`, `restrictToHorizontalAxis`, `snapToGrid(size)`.
_Avoid_: Constraint (that is the Activation constraint), transformer.

### Optional modules

**Snap-back**:
The Return animation: it brings the Overlay back to the Item's origin rect
whenever a drag ends without an Accept (a Reject, a No-drop, or a Cancel).
Not part of the headless core — it ships as the opt-in subpath module
`drop-action/snap-back`, built on the resolution state and origin rect the
core exposes.
_Avoid_: Bounce-back, revert, reject animation (it is not Reject-only).

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
