# drop-action domain

Glossary of the terms used across the drop-action library, its docs, and
its agent skills. Terms here are project-specific drag-and-drop concepts;
general programming concepts (and React primitives) are excluded.

## Language

### Participants

**Drop Action**:
The named drag-and-drop interaction returned by `createDropAction(id)`.
One Drop Action is a self-contained channel: only its own Items and
Zones see each other. It is the unit the whole library is built around.
_Avoid_: Context, DnD context, board, instance.

**Item**:
A draggable element registered in a Drop Action, carrying typed `data`.
The source Item stays in place during a drag; an Overlay travels with
the pointer instead. Identified by an `id`, so an Item is an `id` with
its `data`.
_Avoid_: Draggable, source, card.

**Zone**:
A droppable target region within a Drop Action, identified by a
`zoneId`. A single Drop Action may render many Zones.
_Avoid_: Droppable, target, area, slot.

**Overlay**:
The floating layer rendered at the pointer during a drag;
`<DropAction.Active>` renders into it. Because the source Item never
moves, the Overlay is the only thing the user sees travel.
_Avoid_: Ghost, clone, preview, drag image.

**Active**:
The Item currently being dragged — the one travelling. Its `data` is
read with `useActive()`, and it is rendered in flight by
`<DropAction.Active>` (which mounts into the Overlay). The naming holds
the relationship: the Active Item carries this data.
_Avoid_: Dragging, current, selected, grabbed.

**Drag handle**:
The sub-element of an Item that initiates the drag. By default the whole
Item is its own handle; a custom Drag handle narrows the grabbable area.
_Avoid_: Grip, knob, gripper.

### Drop resolution

**Drop**:
The moment an Item is released over a Zone. Distinct from a Drop Action
(the whole channel): a Drop is a single release event within one.
_Avoid_: Release, drop event (bare).

**Accept / Reject**:
The two outcomes of a Drop, decided by the Zone through `respond`.
Accept is explicit and opt-in — the Zone must call `respond('accepted')`;
anything else, including never responding, is a Reject. Resolution may be
asynchronous: the Zone can await I/O before responding.
_Avoid_: Approve/deny, allow/block, success/failure.

### Input

**Activation constraint**:
The threshold — movement distance and/or press delay — a pointer press
must cross before it becomes a drag, so clicks, taps and text selection
inside an Item are not hijacked.
_Avoid_: Threshold (bare), tolerance, sensor delay.

## Relationships

- A **Drop Action** contains **Items** and **Zones**; only those
  belonging to the same Drop Action see each other.
- On a **Drop**, the **Zone** decides the outcome (**Accept** / **Reject**
  via `respond`) and the accepted **Item** reacts (`onAccept`). The
  decision lives on the Zone; the consequence lives on the Item.
- Exactly one **Item** is **Active** at a time across a Drop Action; the
  **Overlay** renders that Active Item until the Drop resolves.
