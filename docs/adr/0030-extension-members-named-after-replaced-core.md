# Drop-in-replacement Extension members are named after the core member they replace

Snap-back's overlay component and hook are *drop-in replacements* for the
core's `Active` / `useActive`: `useActiveSnapBack` calls `useActive` and
returns a superset of its snapshot, and `<ActiveSnapBack>` renders the same
Overlay (ADR-0010) plus the Return bounce. ADR-0025 made them **additive
siblings**, never an override of `Active` (rejected there as spooky action at a
distance). But while they were named `SnapBack` / `useSnapBack`, channel
dot-notation autocomplete listed them far from `Active` / `useActive` — so a
consumer reached for `Active`, got a working Overlay, and silently lost the
snap-back they had injected. We therefore name such members after the core
member they replace, prefixed: **`ActiveSnapBack`** and **`useActiveSnapBack`**,
so each sits next to its core counterpart in `DA.`.

The `Active` prefix is purely a **dot-notation discoverability** device, so it
is scoped to the two channel members and nothing else. The Extension factory
stays `snapBack()`, its exported types stay `SnapBackOptions` / `SnapBackReads`
/ `SnapBackState`, the glossary term stays **Snap-back** (CONTEXT.md), and the
bounce marker stays `data-snapping` — none of these live on the channel
namespace, so none suffer the autocomplete problem the prefix solves. The
deliberate result is a divergence: `snapBack()` injects a member called
`ActiveSnapBack`. That is accepted because the two names serve different
audiences — the factory and term name the *behaviour* (the Return animation) at
the import site; the member name advertises *what it replaces* at the call site.

This generalises to a convention for future drop-in-replacement Extension
members (a hypothetical `Active`-replacing piece of Sortable, the Keyboard
module, ADR-0004): name them `<CoreMember><Extension>` so they alphabetise next
to what they replace. An Extension that adds a *new* concept rather than
replacing a core member keeps its own name.

## Considered options

- **Keep `SnapBack` / `useSnapBack`** — the discoverability problem persists:
  the snap-back overlay is the one you almost always want once it is injected,
  yet it hides in a different part of the autocomplete list from `Active`.
- **Keep `SnapBack` and add `ActiveSnapBack` as an alias** — rejected. Two
  working overlay members reintroduce exactly the namespace noise the rename
  removes, now worse because picking the "wrong" one still works and silently
  differs.
- **Prefix everything snap-back with `Active` (types, factory)** — rejected as
  overreach. The types and factory are named imports from `drop-action/snap-back`,
  never members of the channel, so the dot-notation rationale does not apply;
  renaming them would only sever them from the term they describe.

## Consequences

Breaking, pre-1.0 (no alias): `SnapBack` → `ActiveSnapBack`, `useSnapBack` →
`useActiveSnapBack`; `createSnapBack` was already removed (ADR-0025). The term
**Snap-back** and the `snapBack()` factory are unchanged, so CONTEXT.md needs no
edit — this is an API-surface naming decision, not a domain term. A consumer
annotating the hook now writes `const s: SnapBackState = DA.useActiveSnapBack()`,
a name mix accepted for the reasons above.
