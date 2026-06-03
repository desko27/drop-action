# Headless core, optional behaviours as subpath modules

The drop-action core manages drag/drop state and geometry but ships no
animation. During the Dropping phase — the gap between release and
resolution — the Overlay persists and the Active Item exposes a `status`
(`'dragging' | 'dropping'`) plus its origin rect, so consumers can build
their own resolution visuals. Opinionated behaviours that many but not
all users want — starting with Snap-back on reject — ship as opt-in
subpath entry modules (e.g. `drop-action/snap-back`), mirroring how
react-call ships `react-call/mutation-flow`.

## Considered options

- **Bake Snap-back into the Overlay** (as dnd-kit's `DragOverlay` does) —
  rejected. It grows the core bundle and locks one opinion about timing,
  easing, and animation tech onto every consumer.
- **Leave Snap-back entirely to userland docs** — rejected. It is common
  enough to deserve a first-party, tree-shakeable module rather than a
  copy-paste recipe everyone re-implements.

## Consequences

The core stays near its size budget and is unopinionated about visuals.
The trade-off is worse out-of-the-box DX: snap-back does not work until
the consumer adds the module (or wires it themselves). The core must
expose enough state — `status` and origin rect — for the module and for
userland to animate against.
