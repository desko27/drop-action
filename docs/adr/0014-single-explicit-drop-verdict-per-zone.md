# Each Zone owns one explicit Drop verdict — `accept` / `reject` with payload

A Drop is decided by exactly one handler: the Over Zone's `onDrop`. We removed
`useDropEvent` and the multi-listener registry (reverting issue #9), so 1 Zone =
1 `onDrop`. That handler receives the dragged Item and a verdict object
`{ accept, reject }` in place of the single `respond('accepted')`. `accept(payload?)`
stays the explicit, privileged outcome (ADR-0003); `reject(payload?)` makes the
decline *statable* — a self-documenting guard clause — while not responding at
all is still a Reject, so the no-op path stays inert. Each verdict's optional
payload flows to the Item, which reacts via `onAccept(item, payload)` /
`onReject(item, payload)` — the two per-Item consequences of a Drop verdict.

## Considered options

- **Keep `respond('accepted' | 'rejected')` as one overloaded function** —
  rejected. Two real verbs, each carrying a distinctly-typed payload, turn the
  signature into an awkward correlated union. An object types each method
  cleanly (`accept(p: A)` / `reject(p: R)`), aligns with the canonical
  Accept/Reject verbs (CONTEXT.md), and is discoverable by autocomplete.
- **A single per-Item `onResolution(outcome)` instead of `onAccept`/`onReject`** —
  rejected. It collapses two distinct concerns: *enacting a per-Item consequence*
  (commit, rollback, analytics) versus *observing the drag's outcome*. It
  de-privileges Accept (ADR-0003) by burying the common case behind a switch,
  and it is the imperative `onDragEnd(outcome)` that ADR-0013 already rejected.
  Whole-drag observation — including No-drop and Cancel, which have no Zone and
  no verdict — stays on the reactive `useResolution()`.
- **Keep multi-listener / remote drop handling (`useDropEvent`)** — rejected. It
  forces a concurrency model ("first `accept` wins", `Promise.allSettled` across
  listeners) and leaves the Reject payload ambiguous, since a Drop is Rejected
  only when *all* handlers decline and there is no single rejecter. Collapsing to
  one `onDrop` per Zone dissolves both. Decoupled handling stays expressible by
  lifting state and passing an `onDrop` prop. A middle option — keep
  `useDropEvent` but single-listener — was also rejected, for leaving two ways to
  fill one slot and a "who wins?" surprise.
- **An explicit `reject()` that vetoes or short-circuits the Drop** — rejected.
  `accept` is the only outcome that may resolve a Drop early; `reject()` is a
  decline, never an override. (Mattered under multi-listener; moot at 1 Zone =
  1 `onDrop`, but the principle stands.)

## Consequences

- **ADR-0003 is refined, not reversed.** Accept stays explicit and privileged;
  Reject stays the default no-op outcome, now also explicitly statable and able
  to carry data. ADR-0013's reactive-resolution channel is reaffirmed as the home
  for whole-drag outcome observation. ADR-0008 is preserved: `useZone(id, { onDrop })`
  remains the hook primitive and `<Zone onDrop>` its sugar — only the
  `useDropEvent` layer beneath is gone.
- The engine loses the `dropListeners` Set, the "first accepted wins" arbitration,
  and the `allSettled`-across-listeners Reject; resolution becomes "await the
  single handler; absent an `accept`, Reject."
- Reverts a shipped, tested feature (issue #9): `useDropEvent` and its tests are
  removed. Acceptable under the current pre-1.0 prerelease, where breaking changes
  are expected.
- Duplicate Zone ids are no longer absorbed by a listener Set; the 1:1 model must
  define two `<Zone id="x">` as an error or last-registration-wins.
- `useResolution()` may additionally surface the accept payload so userland can
  vary Return treatment, but the primary consumers are `onAccept` / `onReject`.
