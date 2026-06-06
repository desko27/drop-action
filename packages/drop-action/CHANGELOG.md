# drop-action

## 1.0.0-next.8

### Minor Changes

- 685e1f0: Collision now tests against each Zone's **visible** region, fixing Over firing from a part of a Zone scrolled out of view (ADR-0023).

  - **A Zone inside an `overflow` scroll/auto/hidden/clip container only collides where it is actually visible.** The engine clips each Zone's rect to its clipping ancestors' boxes (and the viewport) before collision, so the half scrolled out behind the container's edge can no longer be Over. Previously `getBoundingClientRect` reported the full rect, so the dragged Item activated the Zone from a region the user could not see.
  - **A Zone clipped to nothing drops out of collision entirely**, under every detector — including `closestCenter`, which has no overlap requirement and would otherwise hand Over to a fully-hidden Zone's center. The exclusion is re-applied on each scroll/resize re-measure, so a Zone scrolled back into view re-enters and becomes Over-able again.

  The clip lives in the engine's Zone-measuring loop; the `Measure` strategy still returns raw geometry and the collision detectors stay pure, so custom detectors inherit clipping for free and never see a hidden Zone. The clipping-ancestor chain is resolved once per Zone at drag start and cached, so the per-re-measure cost stays in the same order as ADR-0017. Occlusion by elements painted on top is out of scope — only geometric clipping is handled.

### Patch Changes

- f66a081: **Fix:** a Drop Action now enforces a single in-flight drag (ADR-0021). A second concurrent `startDrag` is ignored, which closes two issues:

  - A default `<Item>` (no `customDragHandle`) that wraps a `useDragHandle(id)` element no longer fires the Zone's `onDrop` — and the Item's `onAccept` / `onReject` — twice per Drop. One press previously called `startDrag` twice (the inner trigger plus the bubbled wrapper trigger).
  - Multi-pointer simultaneous drag within one Drop Action is explicitly out of scope: a second finger no longer spins up an incoherent second drag against the single Active / Overlay state.

  Concurrency across separate Drop Actions is unaffected — each is closure-isolated with its own engine.

## 1.0.0-next.7

### Major Changes

- ccb9123: The Return now homes the Overlay **centered** on the source's rect instead of aligning their top-left corners (ADR-0022), so a size-mismatched Overlay — or one lifted with a `grabAnchor` — eases back into the middle of its slot rather than to the source's corner. Identical when the Overlay matches the source's size.

  **Breaking (`resolution` contract).** `Resolution.originRect` is renamed `homeRect` and redefined as the **Overlay's** home — its measured size, centered on the source's live rect — read via `useResolution()`. A Return still eases from `homeRect + transform` to `homeRect`. `<SnapBack>` / `useSnapBack` consumers are unaffected; a consumer reading `useResolution().originRect` directly must read `homeRect` (and note its `width` / `height` are now the Overlay's, its position centered on the source).

### Minor Changes

- ccb9123: Add a **grab anchor** — where the travelling Overlay hangs from the pointer (ADR-0021, CONTEXT.md). When the Overlay is smaller than the source Item the pointer could end up "grabbing the void" past the edge of the visible Overlay, because the grab offset was measured against the source. `grabAnchor` controls which point of the Overlay sits under the pointer.

  The default is now `'proportional'`: the pointer keeps the same _fractional_ grip on the Overlay it had on the source — identical to the old absolute offset when the Overlay matches the source's size, and free of the void when it is smaller. Set it on the Drop Action (`createDropAction({ grabAnchor })`) or override per Item (`useItem(id, { grabAnchor })`, `<Item grabAnchor>`), resolving Item → Drop Action → `'proportional'`. Values:

  - `'proportional'` (default)
  - `'preserve'` — the old source-absolute pixel offset
  - a fixed `{ x, y }` as a fraction of the Overlay — `center` (exported, sugar for `{ x: 0.5, y: 0.5 }`) pins the Overlay's middle under the pointer
  - `(args) => ({ x, y })` for full control, given the source rect, the measured Overlay size, and the grab point

  **Behaviour change:** only observable when the Overlay's size differs from the source (`'proportional'` vs the old absolute offset). Pass `grabAnchor: 'preserve'` to restore the previous behaviour.

- 15bbfc3: Modifiers now clamp against the measured Overlay, not the source Item (ADR-0020), extending ADR-0017's fix from collision to the modifier pipeline.

  `restrictToWindowEdges` kept the _visible_ Overlay inside the window by clamping the source Item's footprint — correct only while the Overlay matched the source's size. When they differ (e.g. a tall accordion-row source with a compact chip Overlay), the chip stuck before reaching the window edge and a larger Overlay overflowed past it. The clamp now uses the Overlay's own size, off the same measurement collision already shares (source-size fallback until the Overlay mounts).

  **Breaking (`Modifier` contract).** `ModifierArgs.originRect` is replaced by `ModifierArgs.overlayRect`: the Overlay's footprint _at rest_ (the source's origin position with the measured Overlay size). A custom modifier reading `originRect` must read `overlayRect`. Note it is the _resting_ rect — collision's `overlayRect` is the _positioned_ one (origin + post-modifier transform); a modifier produces that transform, so it sees the Overlay before it is applied. The built-in axis modifiers and `snapToGrid` are unaffected — they only touch `transform`.

## 1.0.0-next.6

### Minor Changes

- eacc264: Add a grab/grabbing cursor affordance (ADR-0019). The drag handle now shows `cursor: grab` at rest, and the whole document shows `cursor: grabbing` while a drag is live — the latter via a global `<style>` injected for the drag's duration, because a captured pointer roams the page and a handle-local cursor would flicker to whatever is under it. It is on by default; pass `createDropAction({ grabCursor: false })` to take full control of the cursor yourself (the library then touches no cursor — useful if you drive per-Zone cursors like `no-drop`).

  Behaviour change: handles now get `cursor: grab` by default and a global `grabbing` cursor appears during drags. Set `grabCursor: false` to opt out.

### Patch Changes

- 5385c6f: Raise the default mouse/pen activation distance from 4px to 8px (ADR-0012). A press now has to travel 8px before it turns into a drag, giving a larger margin so a slightly shaky click is less likely to start a drag by accident. Touch is unchanged (250ms delay, 5px tolerance).

  Behaviour change: drags that previously began after a 4–7px mouse or pen move now stay a click. Pass `createDropAction({ activationConstraint: { mouse: { distance: 4 }, pen: { distance: 4 } } })` to restore the old threshold.

- 33c5c8f: Snap-back (and any Return) now eases the Overlay back to where the source **currently** sits, not its drag-start position (ADR-0017). A drag that scrolled the page or list under the fixed Overlay used to snap the Item back to a stale frozen spot; the core now re-measures the source at release and re-bases the resolution onto it. The `useResolution()` contract is unchanged in shape and intent — `originRect + transform` is still the Overlay's release position and `originRect` still the home a Return eases to — only the frame is the source's live one. If the source has unmounted or collapsed to a zero-area rect by release, it falls back to the frozen origin.

## 1.0.0-next.5

### Major Changes

- 6ba158c: The Overlay now moves **imperatively** and the store carries only low-frequency state, so a busy page no longer re-renders every Zone on every animation frame (ADR-0018). A new `useOverlay()` primitive returns `{ ref, style }` to spread onto the Overlay element; the engine writes its `translate3d` straight to the node each frame and never through React. `<Active>` and `<SnapBack>` are now thin sugar over it. The store emits only on transitions (drag start, status change, Over change, resolution), and each read (`useActive`, `useOver`, `useResolution`, `isDragging`) returns a referentially-stable value, so a consumer re-renders only when its own slice changes — an Over change re-renders just the two Zones whose membership flips.

  **Breaking:** `transform` is removed from `ActiveSnapshot` / `useActive()` — the per-frame transform lives only in the engine now. Position a headless Overlay with `useOverlay()` instead of reading `active.transform`:

  ```tsx
  // before
  const active = DnD.useActive();
  if (active)
    return (
      <div
        style={{
          position: "fixed",
          transform: `translate3d(${
            active.originRect.left + active.transform.x
          }px, …)`,
        }}
      >
        …
      </div>
    );

  // after
  const active = DnD.useActive();
  const { ref, style } = DnD.useOverlay();
  if (active)
    return (
      <div ref={ref} style={style}>
        …
      </div>
    ); // the engine moves it
  ```

  **Breaking:** `createSnapBack` now also needs `useOverlay`: `createSnapBack({ useActive, useResolution, useOverlay })`.

### Minor Changes

- 6ba158c: Add an **Activation guard** — a `shouldStart?: (event: PointerEvent) => boolean` option on `createDropAction`, evaluated on the initial pointerdown before the activation constraint, deciding whether a press may become a drag at all (ADR-0016). Its default, exported as `defaultShouldStart`, refuses presses that begin on interactive content (`input`, `textarea`, `select`, `[contenteditable]`, matched with `closest()`) and on non-primary mouse buttons — so a click on a checkbox inside a whole-row Item, or a right-click, no longer hijacks into a drag. `<button>` is deliberately not vetoed, since a drag handle is often a button.

  A custom `shouldStart` replaces the default; compose it to keep the defaults:

  ```ts
  createDropAction({ shouldStart: (e) => defaultShouldStart(e) && mine(e) });
  // drag from anywhere:
  createDropAction({ shouldStart: () => true });
  ```

  Behaviour change: with no `shouldStart`, drags that previously began on a form control inside an Item now don't. Pass `shouldStart: () => true` to restore the old "drag from anywhere" behaviour.

- 6ba158c: Collision now tracks scroll and uses the real Overlay's footprint (ADR-0017), fixing two issues found dogfooding:

  - **Scrolling mid-drag no longer drifts Over off the visible Zones.** Zone rects are re-measured on `scroll` (capture phase, so nested scroll containers count) and `resize`, rAF-throttled — always on, not a knob. The source origin stays frozen (the Overlay is `position: fixed` and tracks the pointer), so there is no per-`pointermove` cost; Over is recomputed but only re-emitted when it actually changes.
  - **Collision is sized from the measured Overlay, not the source Item.** When the Overlay differs in size from the source (e.g. a tall accordion-row source with a compact chip Overlay), Over now matches the Overlay the user actually sees, not the source's footprint. The `Measure` boundary gains a `type: 'overlay'` target; a `measure` that ignores `type` treats it like an Item, so existing measures keep working.

  The default detector is unchanged (`rectIntersection`): `pointerWithin` follows the raw pointer and would diverge from a modifier-constrained Overlay, so it stays opt-in per Drop Action.

### Patch Changes

- 6ba158c: `<SnapBack>` now sets `data-snapping` on its Overlay element while the Return bounce is animating (and not during a live drag), mirroring `<Item data-dragging>`. This lets a synthetic/E2E drag-retry loop tell a snap-back-in-progress apart from a live drag. The `snapping` flag was already on `useSnapBack()`; this just surfaces it on the DOM.

## 1.0.0-next.4

### Minor Changes

- 9410068: `createDropAction()` now returns the Drop Action as a **function component** that carries `Item`, `Zone`, `Active` and the hooks as members, instead of a plain namespace object (ADR-0015). The dot-notation API is unchanged — keep using `DnD.Item`, `DnD.Zone`, `DnD.useOver`, … exactly as before, so existing code compiles and runs without changes.

  Why: React Fast Refresh only treats a module as a refresh boundary when every export is component-like. A plain-object export is not, so a shared `export const DnD = createDropAction()` module forced a **full page reload** on every edit in Next.js / Vite. A component-shaped return makes that module a boundary, so editing it remounts the Drop Action subtree instead of reloading the page.

  The returned value is the channel itself and is not meant to be rendered: `<DnD>` warns in development and renders nothing — render its members instead.

## 1.0.0-next.3

### Major Changes

- 557bc30: **Breaking:** `createDropAction` no longer takes an `id` argument. Its signature is now `createDropAction(options?)` — options moves into the first parameter.

  The id was vestigial: it was carried over from dnd-kit, where a single shared `DndContext` needs an id to keep separate experiences from crossing. Here each `createDropAction()` closes over its own store and Item/Zone registries (ADR-0002, ADR-0005), so isolation is structural — two Drop Actions can never see each other regardless of any id, and the argument was never read internally.

  ```tsx
  // before
  const DnD = createDropAction("kanban", { collisionDetection: closestCenter });

  // after
  const DnD = createDropAction({ collisionDetection: closestCenter });
  ```

  Item and Zone ids are unchanged — they remain load-bearing (registry keys, drop identity, `useOver`/`useDragHandle` addressing).

## 1.0.0-next.2

### Major Changes

- 983c4c8: **Breaking:** the `asChild` prop is removed from `<Item>` and `<Zone>`. It was redundant with the hooks — `useItem`/`useZone` already render no DOM of their own — and its `cloneElement` + ref/prop-merge machinery cost ~225 B (~9%) of the core bundle that every consumer paid, imported or not (ADR-0008).

  For a zero-extra-node layout (tables, lists, semantic markup), use the hook directly and spread `ref` + `dragHandleProps` onto your own element — composing any `ref`/handler the element already carries yourself:

  ```tsx
  // before
  <DnD.Item id="row" data={d} asChild>
    <tr className="row">…</tr>
  </DnD.Item>

  // after
  const { ref, dragHandleProps, isDragging } = DnD.useItem('row', d)
  <tr
    ref={ref}
    className="row"
    data-dragging={isDragging || undefined}
    {...dragHandleProps}
  >
    …
  </tr>
  ```

  `as` (wrapper element/component, default `'div'`), `customDragHandle`, and `useDragHandle` are unchanged.

## 1.0.0-next.1

### Major Changes

- d93178d: A Drop is now decided by a single handler — the Over Zone's `onDrop` — which receives a verdict object `{ accept, reject }` in place of the old `respond('accepted')` callback (ADR-0014). `accept(payload?)` stays the explicit, privileged outcome (ADR-0003); `reject(payload?)` makes the decline statable, e.g. a guard clause; calling neither — including never responding — is still a Reject, but an inert one (no `onReject` fires). Each verdict carries an optional payload to the Item, which now reacts via both `onAccept(item, payload)` and the new `onReject(item, payload)` — the two outcomes of a Drop. Payloads are typed through two new optional generics: `createDropAction<Data, Accept, Reject>` (both default to `void`).

  **Breaking:** `useDropEvent` and remote/multi-listener drop handling are removed — it is now 1 Zone = 1 `onDrop` (reverts issue #9), which dissolves the cross-listener concurrency model. Handle drops far from a Zone by lifting state and passing an `onDrop` prop. The `Respond` type is replaced by `DropVerdict<Accept, Reject>`, and a Zone's `onDrop` signature changes from `(item, respond) => …` to `(item, { accept, reject }) => …`.

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
