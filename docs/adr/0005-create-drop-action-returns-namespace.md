---
status: superseded by ADR-0015
---

# createDropAction returns a namespace, not a component

> **Superseded by [ADR-0015](0015-create-drop-action-returns-channel-component.md).**
> The "no primary peer" finding below still holds — it is *why* the
> replacement carrier is a neutral channel component rather than a promoted
> Zone. Only the "plain object" mechanic is revised, to make the factory
> module a React Fast Refresh boundary.

A Drop Action surfaces three distinct peer components — `Zone`, `Item`,
`Active` — plus hooks (`useOver`, `useActive`, `useResolution`,
`useDragHandle`). So, unlike react-call's `createCallable` (which returns
a single component carrying imperative statics), `createDropAction()`
returns a plain namespace object. Zones are rendered as
`<DA.Zone id="...">`, and many can coexist for one Drop Action.

Item ids and Zone ids are kept in separate internal id spaces, so an Item
and a Zone may share the same id without colliding — a hazard in the
original single-prefix design.

## Considered options

- **Component-with-statics, like react-call** — rejected. There is no
  single primary component to attach the others to; three peer
  components make a namespace the honest shape. Forcing one component to
  double as the namespace is exactly the overload (channel vs. zone) this
  design removes.
