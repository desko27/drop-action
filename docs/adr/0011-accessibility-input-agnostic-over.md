# Accessibility: ARIA in core, input-agnostic Over, keyboard as a module

The core ships pointer-only (ADR-0001) but bakes in cheap, high-value
accessibility defaults: `useItem`'s `dragHandleProps` default to
`role="button"`, `tabIndex={0}`, and `aria-roledescription="draggable"`,
plus defensive CSS (`touch-action: none` so the browser does not scroll
or zoom mid-drag, `user-select: none`).

Crucially, the store's Over is architected to be input-source-agnostic:
it can be set by the pointer pipeline (collision detection) or, later, by
a keyboard driver that sets Over by Zone index. Full keyboard dragging
(Space/Enter to grab, arrow keys to move between Zones, Space to drop,
Esc to cancel) and screen-reader `aria-live` announcements ship as an
opt-in module, not v1 core.

## Considered options

- **Full keyboard + announcements in core** — rejected for v1.
  Significant code and opinion (which keys, what is announced, in which
  language) against the ~1KB headless ethos. Deferred to a module.
- **Pointer-only with no accessibility affordances** — rejected. The
  ARIA semantics and the input-agnostic Over are nearly free and avoid a
  re-architecture when the keyboard module lands.

## Consequences

v1 is not keyboard-accessible out of the box, and this is documented
honestly. The engine never needs reworking to add the keyboard module,
because Over is already input-agnostic.
