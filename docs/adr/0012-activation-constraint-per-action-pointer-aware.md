# Activation constraint is per-Drop-Action and pointer-type-aware

_Refined by ADR-0016: activation gains a second concept — an Activation guard
(`shouldStart`) that vetoes ineligible presses by origin/button before the
constraint's threshold is ever evaluated. The per-action, pointer-aware,
no-per-Item-override constraint below still holds._

The activation constraint is configured once through
`createDropAction({ activationConstraint })` and is not overridable
per Item, keeping the API surface small. Its default is pointer-type
aware: an 8px distance for mouse and pen (near-instant drag), and
a ~200–250ms delay plus tolerance for touch, so a quick swipe scrolls a
touch list while a brief press-and-hold starts a drag. `touch-action` is
managed around activation rather than applied blanket, so touch scrolling
survives until a drag actually begins.

## Considered options

- **Per-Item override** — rejected. Extra surface for a rarely-needed
  knob; one action-wide constraint suffices.
- **A flat distance threshold for all pointer types** — rejected. With
  the whole Item acting as its own handle, it hijacks touch scrolling in
  lists.

## Consequences

A single action-wide gesture model. A consumer who needs a different
touch gesture sets it once on the Drop Action.
