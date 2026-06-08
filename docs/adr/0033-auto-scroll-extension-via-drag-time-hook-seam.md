# Auto-scroll ships as an Extension via a drag-time hook seam, not in core

_Refines ADR-0028 (loop-bound stays in core / the Engine tap was deferred until a
second client), and extends ADR-0025 (Extensions) and ADR-0018 (`useOverlay`).
ADR-0028 predicted that **drag-region auto-scroll** would be the second loop-bound
client that finally amortises the Engine tap. Building it showed the prediction is
false: auto-scroll is loop-bound only on the **pointer**, not on the
**measurement** apparatus, so it ships as a subpath Extension — paying for a much
cheaper seam than the one ADR-0028 weighed._

**Auto-scroll** (CONTEXT.md) is the dnd-kit-style behaviour: while a drag's
pointer sits within a band near a **Scrollport**'s edge, that scrollport scrolls
continuously, faster the deeper into the band — innermost scrollport first, the
window as the outermost. It is the edge-proximity, untimed sibling of **Dwell**
(settle-driven), not — as the glossary previously implied — a use of Dwell.

## Why not core, and why not the Engine tap (ADR-0028)

ADR-0028's criterion: a behaviour stays in core (or justifies the Engine tap) when
it is **loop-bound** — needing the per-frame pointer or the continuous re-measure
the store withholds. Dwell needs **both**: a per-frame pointer hit-test *and* the
settling re-measure burst with its `ResizeObserver` / `MutationObserver` / clipping
(ADR-0024, ADR-0026, ADR-0031). Auto-scroll needs **only the first**:

- It needs the **per-frame pointer** and a **self-sustaining loop** (it must keep
  scrolling while the pointer is held *still* near an edge — the same reason Dwell
  could not ride the movement-driven rAF). The subpath adds its **own**
  `pointermove` listener and its **own** rAF for this — a tiny, React-free loop
  that only reads `clientX/clientY` and calls `scrollBy`.
- It needs **none of the core's measurement apparatus.** Scrolling a scrollport
  fires `scroll`, which the core already turns into its settling burst (ADR-0026),
  so **Over stays correct for free** as the list moves under the fixed Overlay
  (ADR-0010). No observers, no burst, no clipping logic ship in the subpath.
- Scrollport discovery is its **own** ~9-line overflow-ancestor walk (the shape of
  `resolveClippers`, ADR-0023, filtered to genuinely-scrollable `scroll`/`auto`),
  so the core exports nothing new for it.

So auto-scroll is not the Dwell-shaped client ADR-0028 expected. The Engine tap —
a per-frame-pointer / re-measure seam into the live loop — would be overkill: there
is nothing in the engine's *measurement* loop auto-scroll needs to tap.

## The drag-time hook seam

Auto-scroll adds **no public API**: enabling it is `createDropAction(opts).extend(autoScroll(config))`
and nothing else — no namespace members (no `AutoScroll` component, no
`useAutoScroll`), and the consumer mounts nothing extra. To run with zero mounting,
the channel exposes one tiny generic seam: a **drag-time hook slot** — a registry
of React hooks that `useOverlay()` (hence `<Active>`, its sugar — ADR-0008/ADR-0018)
executes on each render. `autoScroll()` registers its loop hook into that slot; the
Overlay is mounted exactly once and only while a drag is live (rendering it is
mandatory — ADR-0032), so the hook's lifecycle *is* the drag's, with no manual
gating.

This is a **render-time** seam, categorically lighter than ADR-0028's rejected
**loop** seam: it is `for (const h of slot) h()` inside `useOverlay`, not a tap
registry dispatched through `flush`/`cleanup` with a re-measure stability key.

**The invariant it imposes:** the slot is called like any hook list, so its size
and order must be **stable across renders** — the extension registry must be
**frozen after setup**. This holds because `.extend(...)` runs synchronously at
Drop Action construction (ADR-0025), before any render, and the slot never mutates
afterwards. Registering an extension late would violate the Rules of Hooks; this is
documented as a setup-time-only contract.

## Considered options

- **Keep auto-scroll in core, like Dwell (ADR-0024).** Rejected. It is ~1 KB of
  scroll logic over a 4.75 KB core budget (ADR-0004) that every consumer would pay
  even when never used — and, unlike Dwell, it needs none of the core's apparatus,
  so there is no per-frame dependency forcing it in. The whole point of the subpath
  packaging (ADR-0004) is that this kind of opt-in behaviour stays out.
- **The Engine tap (ADR-0028's anticipated path).** Rejected. It feeds the
  per-frame pointer and re-measure into Extensions; auto-scroll needs neither the
  re-measure nor a *shared* pointer (its own `pointermove` is cheap and React-free).
  A permanent loop seam with stability-key plumbing, justified by a single client
  that does not even use most of it, is exactly the trade ADR-0028 declined.
- **A pure subpath the consumer mounts** — `useAutoScroll()` called inside the
  consumer's overlay, plus an `<AutoScroll/>` sugar sibling. Zero core change, and
  it composes with Snap-back (no fight over the single Overlay renderer). Rejected
  in favour of the seam **for DX**: it costs the consumer a line/mount per Drop
  Action, whereas the seam makes `.extend(autoScroll())` the entire surface. The
  manual form is still reachable if ever needed; the seam just removes the ceremony.
- **An `<ActiveAutoScroll>` drop-in that replaces `<Active>`** (mirroring
  Snap-back's `<ActiveSnapBack>`). Rejected. The single Overlay has one renderer, so
  this would be **mutually exclusive with Snap-back** — a consumer cannot mount two
  replacement Actives. ADR-0025 also forbids an Extension overriding a core member.
  The additive drag-time hook avoids both: many extensions register hooks; none owns
  the Overlay.

## Consequences

- **Refines ADR-0028.** Its loop-bound→core rule stands, but its worked example is
  corrected: auto-scroll is loop-bound on the *pointer only*, so it is an Extension,
  not a core resident or an Engine-tap client. The Engine tap remains unbuilt and
  unjustified — auto-scroll did not need it.
- **A new, generic capability.** The drag-time hook slot lets *any* future
  Extension run zero-mount, during-drag behaviour (haptics, sound, analytics, a
  custom cursor) — things impossible before, when every Extension required the
  consumer to mount something. Auto-scroll is its first and currently only client;
  the seam is accepted on the strength of this generality plus the DX win, not on a
  single-client amortisation.
- **Rules-of-Hooks contract.** Extensions must be registered at setup
  (`.extend(...)` synchronously), never lazily; the slot is frozen before first
  render. A dev-time guard can flag late registration.
- **Over correctness is free.** Auto-scroll triggers `scroll`, which feeds the
  existing settling burst (ADR-0026), so the Over Zone tracks the moving list with
  no new measurement code in the subpath.
- **Config (not ADR-worthy, recorded for completeness):** `threshold` (band size
  as a fraction of the scrollport per axis, default `0.2`), `speed` (max px/s),
  `acceleration` (depth→speed exponent, default `1` = linear), both axes
  independent, and innermost-first with **fallthrough** to the next outer scrollport
  (and the window) once the inner one hits its scroll limit on that axis. No
  `enabled` flag and no per-scrollport `canScroll` in v1 — disabling auto-scroll is
  dropping the Extension; both are additive later.
- **Glossary corrected.** Dwell no longer claims "auto-scroll regions" as a use;
  Auto-scroll and Scrollport are first-class terms, and Extension now covers both
  member injection and drag-time hooks (CONTEXT.md).
