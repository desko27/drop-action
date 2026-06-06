# The core exposes a terminal resolution signal, separate from `active`

_Refined by ADR-0017: the `resolution`'s `originRect` is the source re-measured
at release (its live home), with `transform` re-based onto it, so a Return that
scrolled the page eases back to where the source now sits. The endpoints are
unchanged — `originRect + transform` is still the Overlay's release position and
`originRect` still the home it eases to — only the frame is the live one._

A drag ends in one of four mutually exclusive terminal outcomes — Accept,
Reject, No-drop (released over no Zone), or Cancel (Esc / pointercancel
before any Drop). The core publishes which one happened through a
short-lived `resolution` snapshot — `{ outcome, originRect, transform,
item }` — read with `useResolution()`, kept distinct from the `active`
snapshot. It is emitted atomically with `active` becoming null (one render
sees `active === null` alongside the outcome) and persists until the next
drag starts. This exists because the three non-Accept outcomes form a
Return, and Snap-back — now the Return animation, not the Reject animation
(CONTEXT.md) — needs to know an Accept did *not* happen. That fact is not
otherwise observable: a synchronous Accept and a Cancel are identical
through `active`/`status` (both go `dragging → null`), and an async Accept
is identical to an async Reject (both render `dropping → null`).

## Considered options

- **Infer from the rendered `status`** (what the first Snap-back did) —
  rejected. Keying off "a `'dropping'` frame committed" detects
  *released-over-a-Zone-with-an-async-gap*, not Reject: it false-positives
  on async Accept and is structurally blind to No-drop and Cancel, which
  never render `'dropping'`. The outcome must be stated, not inferred.
- **Extend `status` with terminal values** (`'accepted' | 'rejected' |
  'no-drop' | 'cancelled'`), keeping `active` alive one extra frame —
  rejected. It changes *when* `useActive()` returns null, so every
  consumer's `if (!active)` inherits a new terminal frame for a fact only
  Snap-back consumes.
- **An imperative `onDragEnd(outcome)` callback** — rejected. It fights the
  reactive-read design the modules are built on (ADR-0004, ADR-0008);
  Snap-back would have to funnel the event back into React state itself.

## Consequences

Snap-back reads `resolution.outcome` directly — exact, not inferred — which
fixes the async-Accept false bounce and lets the inference state
(`sawDropping` / `lastDropping`) go away. The `outcome` is surfaced through
`useSnapBack()` so userland can vary treatment per outcome (e.g. an instant
dismiss on Cancel) while the `<SnapBack>` convenience bounces uniformly.
The cost is a second piece of public reactive state to maintain, and the
core must keep the four exit points labelled. `resolution` carries
`'accepted'` too, so it is a drag-resolution signal, not a Return-only one.
