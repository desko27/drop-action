# One Active per Drop Action; multi-pointer simultaneous drag is out of scope

_Makes the engine enforce the invariant CONTEXT.md already states ("exactly one
Item is Active at a time across a Drop Action"), and records why multi-pointer
drag is deliberately not supported._

The Pointer Events engine (ADR-0001) opens a fresh gesture machine per
`startDrag`, and every listener filters by `pointerId`
(`if (e.pointerId !== pointerId) return`). So a second pointer pressing a second
Item does not crash — its gesture runs independently at the event level. But the
store holds a **single** `active` / `over` / `resolution` slot (ADR-0018,
[store.ts](../../packages/drop-action/src/createDropAction/store.ts)) and there
is a **single** Overlay node (ADR-0010). Two in-flight drags therefore collapse
onto shared state: the last `beginDrag` wins `active` (so the other Item's
`isActiveId` flips false mid-drag), both `flush` loops write their transform to
the one Overlay node (it jumps between pointers), and `over` / `resolution` clobber
each other. The gesture is *permitted* but *incoherent* — there is no coherent
way to render or resolve two travelling Items with single-slot state.

We decided to **enforce one in-flight drag (pending or active) per Drop Action**:
`startDrag` becomes a no-op while a drag is already in flight in that Drop Action.
Multi-pointer simultaneous drag within a single Drop Action is **out of scope**.
This is the principled enforcement of the documented single-Active invariant, not
a new constraint. It also closes a latent bug: a default Item (no
`customDragHandle`) that wraps a `useDragHandle(id)` element fires `startDrag`
twice for one press (the inner trigger plus the bubbled wrapper trigger), which
without the guard runs the Zone's `onDrop` — and the Item's `onAccept` /
`onReject` — twice per Drop.

Concurrency still exists, but only **across** Drop Actions: each
`createDropAction()` is closure-isolated (ADR-0002, ADR-0005) with its own store,
Overlay, and guard, so two independent Drop Actions each dragged by one pointer
work fine. The guard is per-engine, so it never touches that case.

## Considered options

- **A per-`pointerId` re-entry guard** — rejected. It catches only the
  same-press bubbling double-call (identical `pointerId`); two fingers carry
  *distinct* pointerIds, so both would pass and the incoherent two-drag state
  would survive. It fails to enforce the single-Active invariant, which is the
  actual goal.
- **Support concurrent multi-pointer drags** (multi-slot store, multiple Overlay
  nodes, multi-Item Over) — rejected. A foundational redesign of the store,
  Overlay, and collision model for a use case the domain explicitly excludes and
  no consumer has asked for. The single-Active model is load-bearing across the
  library.
- **Document the combination as misuse, change nothing** — rejected. The
  bubbling double-`startDrag` double-fires `onDrop` (data-corrupting for any
  side-effecting Drop), and the incoherent state is reachable through ordinary
  two-finger touch, not just exotic misuse.

## Consequences

- A second concurrent press within a Drop Action — a second finger, or the
  bubbled wrapper trigger of a default Item containing a `useDragHandle` — is a
  no-op. The double-`onDrop` bug is closed by construction.
- Two separate Drop Actions still drag concurrently; the guard is per-engine.
- Real multi-Item drag, if ever wanted, is a foundational change (multi-slot
  state, multiple Overlays), not a guard tweak — this ADR is the explicit no.
- The grabbing-cursor comment in
  [engine.ts](../../packages/drop-action/src/createDropAction/engine.ts) is
  corrected: its "concurrent drags" note scopes to the multi-Drop-Action case
  (which legitimately shares the one global cursor `<style>`), not multi-pointer
  within one action, which this ADR rules out.
