# Active data is snapshotted at drag-start, stable for the flight

The Active Item's `{ id, data }` is captured once when a drag activates and is
the same value every reader sees for the whole flight — `useActive`, `useOver`,
`onDrop` / `onAccept` / `onReject`, `onDwell`.
Previously the imperative paths reread the live `dataRef` at release/fire time
while the reactive paths (`useActive` / `useOver`) stayed frozen at drag-start —
an asymmetry that only surfaced if `data` mutated mid-drag. We close it by
freezing one snapshot and reading it everywhere. Only `data` / `id` are frozen:
geometry stays live (Zones re-measured, ADR-0017; the Return re-homes on the
live source, ADR-0022) and `status` still transitions `dragging → dropping`.

## Considered options

- **Support mutable data coherently** — re-commit `active` whenever `dataRef`
  changes, so reactive readers re-render and imperative readers see fresh data.
  Rejected: a render per mutation fights the low-frequency store (ADR-0018) for
  a case with no demonstrated need. It is purely additive on top of this
  decision if a real need ever appears.

## Consequences

- Behaviour change (accepted in the pre-1.0 phase): the imperative paths —
  `onDrop` / `onAccept` / `onReject` / `onDwell` — now receive the drag-start
  `data`, not the value live at release/fire time. A consumer mutating an Item's
  `data` mid-drag will not see it reflected.
- The reactive paths (`useActive` / `useOver`) are unchanged in value but now
  provably agree with the imperative ones — one snapshot, read everywhere.
