# Return homes the Overlay centered on the source; resolution carries `homeRect`

_Refines ADR-0013 (the terminal resolution) and ADR-0017 (the live re-base of
the Return target): the rect the Overlay eases back to is renamed
`Resolution.originRect → homeRect` and redefined as the **Overlay's** home —
its measured size, centered on the source's live rect._

Snap-back eases the Overlay's **top-left** to the source's top-left
(`x = originRect.left + (atHome ? 0 : transform.x)`). That works only while the
Overlay matches the source's size. Once they differ (ADR-0017) — or a grab
anchor (ADR-0021) lifts a small Overlay centered on the pointer — top-left
homing returns the Overlay to the source's *corner*, not its slot.

The Return now homes the Overlay **centered** on the source's live rect:

```
home.left = sourceLive.left + (sourceLive.width − overlaySize.width) / 2   // and Y
transform = release − home
```

It is the same re-base ADR-0017 already does, only the target moves from the
source's top-left to the centered home. The engine has both rects at release, so
the cost is arithmetic, not machinery. When Overlay == source the centered home
equals the source top-left — byte-for-byte the old behaviour — so this only
diverges under a size mismatch, exactly where corner-homing looked wrong. It is
a **fixed** policy, not a knob, and **decoupled** from the grab anchor: the
anchor decides where the Overlay hangs *during* the drag, the home decides where
it returns.

The contract change is a rename. `Resolution.originRect` did double duty as "the
source's rect" and "the home the Overlay eases to" — coincident only while
homing was top-left and the Overlay was anchored at the source's top-left.
Centering breaks the coincidence. Since Snap-back already used only the field's
`.left/.top` and eased the top-left to it, its operative meaning was always "the
home", so we rename it `homeRect` and redefine it as the Overlay's home rect
(Overlay-sized, centered on the source's live rect). `ActiveSnapshot.originRect`
stays the source's rect, so `originRect` no longer means two different things in
two snapshots. Snap-back is unchanged but for the rename — the centering lives in
the engine's re-base, and the animation still starts at the true release
position (no jump) and eases the top-left to `homeRect`.

## Considered options

- **Keep top-left homing** — rejected. It returns a size-mismatched Overlay to
  the source's corner; centering is identical when sizes match and symmetric
  when they don't.
- **Keep the field named `originRect`, just redefine it to the Overlay home** —
  rejected. `originRect` would then mean "source rect" in `ActiveSnapshot` but
  "Overlay home" in `Resolution` — the kind of overloaded term the glossary
  exists to prevent.
- **Add `overlaySize` to the resolution and center inside Snap-back** — rejected.
  It pushes the homing policy onto every custom animator. The engine already
  holds both rects, so it owns the policy and Snap-back stays policy-agnostic,
  easing the top-left to whatever home the engine published.
- **Make homing configurable, or couple it to the grab anchor** — rejected.
  Centering is universally ≥ top-left and matched-identical, so a knob is
  unwarranted; coupling it to the anchor adds complexity (and an ambiguous home
  once the page has scrolled) for no gain.

## Consequences

- Breaking, pre-1.0: `Resolution.originRect → homeRect`; its width/height are now
  the Overlay's and its position centers on the source. Consumers reading
  `useResolution()` directly update the field name; `<SnapBack>` / `useSnapBack`
  users are unaffected beyond the library's own rename.
- A non-opt-in behaviour change for size-mismatched Overlays (corner → center),
  in the same spirit as the `proportional` default (ADR-0021): correctness that
  is not the consumer's call.
