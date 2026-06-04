# Drop resolution is asynchronous, and Accept is explicit

_Refined by ADR-0014: the verdict is now an `{ accept, reject }` object carrying
an optional payload, Reject is also explicitly statable, and the Item reacts via
`onAccept` / `onReject`. The async, explicit-Accept, no-op-is-Reject core below
still holds._

When an Item is dropped over a Zone, the Zone decides the outcome through
a `respond` callback. We allow `respond` to be called asynchronously —
the Zone may await I/O (e.g. a server check) before resolving — and we
treat anything other than an explicit `respond('accepted')`, including
never responding, as a Reject. The accepted Item then reacts via its own
`onAccept`. The decision lives on the Zone; the consequence lives on the
Item.

## Considered options

- **Strictly synchronous `respond`** — rejected as the default. Simpler,
  but it forecloses the library's distinguishing use case: a Zone that
  validates a Drop against asynchronous state before accepting. Sync
  remains expressible (just call `respond` immediately), so async is a
  superset, not a cost to sync users.
- **Default to Accept when no response is given** — rejected. It makes
  the unsafe outcome the silent one: an `onDrop` that forgets to respond
  would accept silently. Making Reject the default keeps the no-op path
  inert.

## Consequences

Async resolution opens a gap between release and outcome. The behaviour
of the Overlay during that gap, and the visual treatment of Accept vs
Reject (e.g. snap-back), are resolved separately.
