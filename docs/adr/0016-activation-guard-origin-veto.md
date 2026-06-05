# Activation guard: an origin-veto predicate, separate from the constraint

A press becomes eligible to drag only if it clears an **Activation guard** —
`createDropAction({ shouldStart })`, a `(event: PointerEvent) => boolean`
evaluated on the initial pointerdown, *before* the pending-activation phase.
Its default, exported as `defaultShouldStart`, refuses presses on interactive
content (`input, textarea, select, [contenteditable]`, matched with `closest()`
so a child of a control counts) and on non-primary mouse buttons
(`event.button !== 0`) — so a click on a checkbox inside a whole-row Item, or a
right-click, never hijacks into a drag. `<button>` is deliberately *not* vetoed:
a drag handle is often a button. (`isPrimary` is not consulted: it is `false` on
synthetic events, and a competing second-finger drag-start is out of scope.) The
guard is a
separate concept and a separate option from the Activation constraint
(ADR-0012): the guard asks "is this press eligible?" at press time; the
constraint asks "did the gesture cross the distance/delay threshold?" once
eligible. Order: guard → pending → constraint → drag.

## Considered options

- **Default behaviour only, no API** — rejected. No escape hatch for the cases
  the built-in set misses (a draggable that legitimately starts on a button, or
  a non-interactive subtree that should not be grabbable).
- **A predicate only, no default** — rejected. Pushes the obvious "don't start a
  drag on a checkbox" back onto every consumer; ORION's whole-row sidebars (and
  everyone else) would re-implement the same veto. The shipped ORION `offer`
  pilot only dodged the gap with `customDragHandle`.
- **Fold it into `activationConstraint`** — rejected. The constraint is shaped
  per pointer kind (`{ mouse, pen, touch }`); the guard is not per-kind and is a
  different axis. Nesting muddies both shapes. It is a top-level sibling option
  instead.
- **Compose (AND) the consumer predicate onto the default** — rejected. Replace
  matches the collision-detection / modifier precedent (a replaceable function
  with built-ins exported); composing is one `&&` away via `defaultShouldStart`.

## Consequences

- **Refines ADR-0012.** Activation is now two concepts, not one: the guard
  (eligibility, by origin/button) then the constraint (threshold, by
  distance/delay). ADR-0012's "keep the API surface small, per-action, no
  per-Item override" still holds for both.
- **Default behaviour change.** Drags no longer start on form controls,
  contenteditable, or non-primary buttons. Acceptable in prerelease; consumers
  who want the old "drag from anywhere" pass `shouldStart: () => true`.
- **Replacing is total.** A custom `shouldStart` owns the primary-button check
  too; `shouldStart: (e) => defaultShouldStart(e) && mine(e)` keeps it.
- **One chokepoint.** The guard runs in the engine's `startDrag`, so it covers
  the default handle (`useItem`) and `useDragHandle` alike; a refused press
  registers no pending listeners and never calls `preventDefault`, so the
  browser handles the click/checkbox normally.
