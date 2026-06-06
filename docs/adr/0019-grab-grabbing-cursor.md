# Grab/grabbing cursor: a cosmetic default with a global grabbing style

The handle shows `cursor: grab` at rest and the whole document shows
`cursor: grabbing` while a drag is live — on by default, opt out with
`createDropAction({ grabCursor: false })`. This is the library's first *cosmetic*
default: ADR-0011's baked-in CSS was defensive (`touch-action`, `user-select`),
this is a pure affordance. But grab/grabbing is a near-universal, near-free
convention for draggables, so it earns the same "cheap, high-value default"
treatment as the ARIA semantics, with an opt-out for full control.

The two halves differ sharply:

- **`grab` (idle)** is a local inline style on the handle (`useItem` /
  `useDragHandle`), closure-scoped and SSR-safe.
- **`grabbing` (dragging)** must be **global**. During a drag the pointer is
  captured and roams the page, and the cursor reflects whatever element is under
  it — pointer capture does not reliably carry the cursor across browsers. So a
  handle-local grabbing barely shows; only a document-wide rule shows grabbing
  everywhere without flickering to whatever is under the pointer. The engine
  injects one shared `<style>` — `*{cursor:grabbing!important}` — at activation
  and removes it in `cleanup()` (on release/cancel, *not* at the async
  resolution: with the pointer up the user is no longer grabbing). This is the
  library's second touch of `document` after the Overlay portal (ADR-0010), and
  its first injected global style.

## Considered options

- **`body` / `html` cursor instead of a universal `!important` rule** —
  rejected. Interactive elements (links, inputs) keep their own cursor, so
  grabbing flickers over them — the exact thing the global cursor exists to
  prevent.
- **Off by default (opt-in)** — rejected. The affordance is what most consumers
  want; opt-out matches the baked-in-defaults posture of ADR-0011.
- **Ref-count the shared style for concurrent drags** — rejected. It adds
  module-global state that leaks on an abandoned (unmounted-mid-drag) drag, for
  a purely cosmetic edge (two simultaneous pointer drags). The idempotent
  add/remove is smaller and self-healing: the next completed drag re-adds and
  clears it.
- **A single `cursor: boolean` vs per-Item override** — rejected. The boolean is
  the minimal surface that matches "disable it"; per-Item is out, per ADR-0012
  (configured once per Drop Action). Splitting grab from grabbing, or accepting
  custom cursor values, stays additive for later.

## Consequences

- The universal `!important` grabbing overrides any per-Zone cursor (e.g. a
  `no-drop` over an invalid target) during a drag. A consumer who needs that
  sets `grabCursor: false` and drives the cursor themselves.
- Touching `document.head` during a drag is a global side effect, kept narrow:
  only while a drag is live, only when `grabCursor` is on, removed on every exit
  path. Removal is driven by the **pointer gesture**, not React: `cleanup()`
  runs on `pointerup` / `pointercancel` / Escape — all `window` listeners — so
  unmounting the `<Item>` or `<Active>` mid-drag does *not* strand the cursor,
  because the release still reaches `onUp` / `onCancel` (even after
  `lostpointercapture` from removing the captured node). It would persist only
  if none of those ever fired after activation, which does not happen in normal
  use — and a full navigation tears down the injected `<style>` with the
  document anyway.
