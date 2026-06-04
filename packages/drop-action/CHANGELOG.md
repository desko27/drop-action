# drop-action

## 1.0.0-next.0

### Major Changes

- 47f9f41: Snap-back is now the Return animation, not the Reject-only one: it eases the Overlay home on every ending that is not an Accept — a Reject, a No-drop (released over no Zone), or a Cancel (Esc / pointercancel) — and leaves an Accept untouched, including an async Accept that previously bounced by accident (ADR-0013, CONTEXT.md). The core states the terminal outcome directly through a new `resolution` reactive read: `useResolution()` returns `{ outcome, originRect, transform, item }` where `outcome` is `'accepted' | 'rejected' | 'no-drop' | 'cancelled'`, emitted atomically as the Active goes null and kept until the next drag starts. `createSnapBack` now takes the two reads it needs — `createSnapBack({ useActive, useResolution })` — and `useSnapBack()` exposes `outcome` so consumers can vary treatment per Return (e.g. skip the bounce on a Cancel) while `<SnapBack>` keeps bouncing uniformly.

## 0.1.0

### Minor Changes

- 92cf694: Async drop resolution with explicit accept, a Dropping status that persists the Overlay, and Esc/pointercancel cancellation.
- b37a7d1: Headless ergonomics: `useItem`/`useZone` are first-class, well-typed primitives usable with no wrapper node (spread `ref` + props onto a `<tr>`/`<li>`). `Item`/`Zone` gain `as` (wrapper element/component, default `'div'`) and `asChild` (merge ref + props onto a single child via `cloneElement`, adding no DOM node). New `customDragHandle` option makes the Item a `role="group"` container that registers and travels but does not itself trigger a drag; the new `useDragHandle(id)` hook places the trigger anywhere — including outside the Item's subtree — with no registry (ADR-0009). Drag handles keep the ARIA defaults (`role`, `tabIndex`, `aria-roledescription`) and defensive CSS (`touch-action: none`, `user-select: none`) per ADR-0011.
- f4f5fa2: Pluggable collision detection. `createDropAction` now accepts a
  `collisionDetection` option (defaulting to `rectIntersection`) of shape
  `(args: { pointer, overlayRect, zones }) => zoneId | null`, returning the
  single winning Zone. Ships three tree-shakeable built-ins —
  `rectIntersection`, `pointerWithin`, and `closestCenter` — alongside the
  `CollisionDetection`, `CollisionArgs`, and `ZoneRect` types. A custom
  detector can be supplied, and a Drop Action with many Zones routes each Drop
  to the Zone the detector selects (scoped to its own Zones).
- 1cd1e90: Add pluggable modifiers: a composable `(args) => Transform` pipeline applied
  left-to-right whose result drives both the Overlay transform and the
  post-modifier rect collision tests against (ADR-0007). Configurable via the
  `modifiers` option on `createDropAction`, defaulting to `[restrictToWindowEdges]`.
  Ships tree-shakeable built-ins `restrictToWindowEdges`, `restrictToVerticalAxis`,
  `restrictToHorizontalAxis`, and `snapToGrid(size)`, plus the `Modifier`,
  `ModifierArgs`, and `Transform` types.
- 7097170: Pointer-type-aware activation constraint (touch lists stay scrollable). A
  press no longer becomes a drag immediately: the engine opens a pending
  phase gated by a configurable `activationConstraint` on `createDropAction`.
  Mouse and pen activate on a small distance (4px default) for a near-instant
  drag; touch activates only on a press-and-hold (250ms within a 5px
  tolerance), so a quick swipe scrolls a list instead of dragging. The
  constraint is data plus a pure `evaluateActivation` evaluator (unit-tested
  across pointer types). `touch-action: none` is now applied only while a
  drag is actually under way, so touch scrolling survives until activation.
  Exports new public types: `ActivationConstraint`, `DistanceActivation`,
  `DelayActivation`, `PointerKind`.
- 6cd6ecd: Add reactive read API: `useActive()` (id, data, status, origin rect), `useOver(zoneId)`, `useItem().isDragging`, and a `container` prop on `Active` to override the portal target.
- a209c43: Add `useDropEvent(zoneId, (item, respond) => …)` so a Drop can be handled far
  from where its Zone is rendered. Drop handling is now a per-zoneId
  subscription: many listeners may share a zoneId, and a Drop fires them all
  with `respond('accepted')` idempotent (first accept wins). The `Zone`'s
  `onDrop` is now optional and implemented as sugar over `useDropEvent`, so a
  Zone stays measurable for collision even when its only drop handler lives
  remotely.
- fe3b814: Add the opt-in subpath module `drop-action/snap-back`: on a Reject it eases the Overlay back to the Item's origin rect; on an Accept it does not snap back. `createSnapBack(useActive)` returns a `useSnapBack()` hook and a `<SnapBack>` Overlay component, built only on the public `status` + origin rect (no core internals), and is tree-shakeable — importing `drop-action` pulls none of it. This also establishes the subpath-entry packaging pattern (second build entry, dedicated `exports` condition with ESM/CJS + `.d.ts`/`.d.cts`) that future modules will follow.
- 6fa0fcb: Walking skeleton: the first end-to-end drop → accept path. `createDropAction(id)` returns a namespace (`Item`, `Zone`, `Active`, plus `useItem`/`useZone`/`useActive`) built on a custom Pointer Events engine, a closure-scoped `useSyncExternalStore` store, an injectable `measure` boundary, and a `document.body`-portalled Overlay. A Drop resolves through the Zone's `onDrop(item, respond)`; `respond('accepted')` runs the Item's `onAccept`.
