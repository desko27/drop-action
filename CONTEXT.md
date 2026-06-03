# drop-action domain

Glossary of the terms used across the drop-action library, its docs, and
its agent skills. Terms here are project-specific drag-and-drop concepts;
general programming concepts (and React primitives) are excluded.

## Language

### Core

**Drop Action**:
The named drag-and-drop interaction returned by `createDropAction(id)`.
One Drop Action is a self-contained channel: only its own Items and
Zones see each other. It is the unit the whole library is built around.
_Avoid_: Context, DnD context, board, instance.

**Item**:
A draggable element registered in a Drop Action, carrying typed `data`.
The source Item stays in place during a drag; an Overlay travels with
the pointer instead.
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

**Activation constraint**:
The threshold — movement distance and/or press delay — a pointer press
must cross before it becomes a drag, so clicks, taps and text selection
inside an Item are not hijacked.
_Avoid_: Threshold (bare), tolerance, sensor delay.

## Flagged ambiguities

- **"Drop"** vs **"Drop Action"**: "Drop" is the event/moment an Item is
  released over a Zone; "Drop Action" is the whole interaction channel.
  Keep them distinct.
