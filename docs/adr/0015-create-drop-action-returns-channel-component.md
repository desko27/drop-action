# createDropAction returns a channel component, not a plain object

`createDropAction(id)` returns a function component that *is* the channel,
carrying the peer components (`Zone`, `Item`, `Active`) and the hooks as
static members — the dot-notation API (`DA.Zone`, `DA.useOver`, …) is
unchanged from the plain-object namespace of ADR-0005. The carrier changed
from object to component for one reason: React Fast Refresh only treats a
module as a refresh boundary when every export is component-like
(`isLikelyComponentType`). A plain-object export fails that check, so the
common `export const DA = createDropAction(...)` module forces a **full page
reload** on every edit in Next.js / Fast Refresh setups; a component-shaped
export makes the module a boundary, so editing it remounts the Drop Action
subtree instead of reloading the page.

The component is not meant to be rendered: `<DA>` warns in dev and renders
nothing. It exists only as the Fast-Refresh-friendly carrier — there is no
primary peer to render (ADR-0005), which is exactly why the carrier is a
neutral channel component and not a promoted Zone/Item/Active.

## Considered options

- **Plain namespace object** (ADR-0005, now superseded) — the honest shape,
  but not a Fast Refresh boundary; a shared factory module full-reloads on
  every edit. The goal here is narrow — kill the full reload — and an object
  cannot satisfy the boundary check at all.
- **Promote a peer (Zone) to the primary**, dnd-kit / react-call style —
  rejected. A Drop Action is a *channel that contains many Zones*
  (CONTEXT.md), so making the channel *be* a Zone collapses the channel into
  one of its contained parts and overloads the channel `id` with a `zoneId`;
  a three-column board would render the channel symbol once per column. The
  react-call analogy does not transfer: react-call has a single `Root`
  component plus imperative methods, whereas a Drop Action surfaces three
  peer components with no natural primary.

## Consequences

- State is **not** preserved across an edit to the factory module: the
  closure re-runs and the peers get fresh identities, so the Drop Action
  subtree remounts. This is accepted — the objective is only to avoid the
  full page reload, not to preserve live drag state across that edit.
- The returned value is a function with static members. Anything that
  introspects it (tests, tooling) reads those members off the function.
