---
"drop-action": major
---

A Drop is now decided by a single handler — the Over Zone's `onDrop` — which receives a verdict object `{ accept, reject }` in place of the old `respond('accepted')` callback (ADR-0014). `accept(payload?)` stays the explicit, privileged outcome (ADR-0003); `reject(payload?)` makes the decline statable, e.g. a guard clause; calling neither — including never responding — is still a Reject, but an inert one (no `onReject` fires). Each verdict carries an optional payload to the Item, which now reacts via both `onAccept(item, payload)` and the new `onReject(item, payload)` — the two outcomes of a Drop. Payloads are typed through two new optional generics: `createDropAction<Data, Accept, Reject>` (both default to `void`).

**Breaking:** `useDropEvent` and remote/multi-listener drop handling are removed — it is now 1 Zone = 1 `onDrop` (reverts issue #9), which dissolves the cross-listener concurrency model. Handle drops far from a Zone by lifting state and passing an `onDrop` prop. The `Respond` type is replaced by `DropVerdict<Accept, Reject>`, and a Zone's `onDrop` signature changes from `(item, respond) => …` to `(item, { accept, reject }) => …`.
