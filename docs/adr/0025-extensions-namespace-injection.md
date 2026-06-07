# Extensions inject members into the channel namespace

Opt-in modules (ADR-0004) attach through a `.extend(...)` method on the
channel: `createDropAction<Card>(options).extend(snapBack<Card>())`. An
**Extension** is a function `(channel) => members`; `.extend` calls each with
the channel and merges the returned members onto it (ADR-0015) with
`Object.assign`, so they read under the namespace (`DA.SnapBack`,
`DA.useSnapBack`, …). An Extension is built only on the channel's public members
(snap-back reads `channel.useActive` / `useResolution` / `useOverlay`), so the
core gains only a tiny generic merge — the Extension's own code still arrives
through its subpath import (ADR-0004), so tree-shaking holds and a consumer who
never imports it bundles none of it. Snap-back is migrated from the standalone
`createSnapBack(reads, options)` to `snapBack(options) → (channel) => members`,
and `createSnapBack` is removed (a breaking change, accepted in the pre-1.0
phase). Applying one by hand is just calling it: `snapBack()(DA)`.

The motivation is ceremony. The standalone factory made the consumer forward
`useActive` / `useResolution` / `useOverlay` by hand and keep the result in a
loose variable; injection centralizes the wiring while keeping the out-of-core,
tree-shakeable packaging that ADR-0004 established.

Why a **method** and not a second `createDropAction(options, [extensions])`
argument — the form first chosen. TypeScript stops inferring trailing type
parameters once any are given explicitly, and `Data` is always explicit
(`createDropAction<Card>(…)`, since it cannot be inferred from `options`). A
trailing `Exts` type parameter on the factory would therefore always fall back
to its default, collapsing the merged member types and leaving `DA.SnapBack`
untyped. A separate `.extend(...)` call has its own inference site: `Data` is
already fixed on the receiver, so the Extension tuple infers and the merged
members stay typed. `.extend` is variadic, so several Extensions still apply in
one call.

## Considered options

- **A second positional argument `createDropAction(options, [snapBack()])`** —
  the most centralized form, and what was chosen first. Abandoned: it cannot
  keep Extension members typed once `Data` is explicit (the inference collapse
  above). `.extend(...)` recovers the typing at nearly the same ergonomics.
- **Extensions inside `options` (`{ use: [...] }`)** — same inference problem,
  and conflates engine config with namespace add-ons.
- **A curated seam object instead of the whole channel** — rejected. The
  channel holds only public members, so there is nothing to protect by
  curating; it would be maintenance for no gain.
- **Let an Extension override a core member** (e.g. `SnapBack` replacing
  `Active`) — rejected. It is spooky action at a distance (a far-off line
  changes what `DA.Active` does) and forces last-wins type merging. Extensions
  are additive; a returned name colliding with an existing member dev-warns.

## Consequences

A second consumer would keep the protocol honest, but Dwell — the other
candidate — landed in the core (ADR-0024), so snap-back alone validates it for
now, with Sortable and the Keyboard module (ADR-0004) as future Extensions.
Breaking: `createSnapBack` callers move to `.extend(snapBack())` (injected) or
`snapBack()(DA)` (manual) — expected pre-1.0. Type inference stays additive —
`UnionToIntersection<ReturnType<Exts[number]>>` over the `.extend` argument
tuple — because Extensions depend only on core members, never on each other.
