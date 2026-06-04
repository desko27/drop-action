---
"drop-action": minor
---

Add the opt-in subpath module `drop-action/snap-back`: on a Reject it eases the Overlay back to the Item's origin rect; on an Accept it does not snap back. `createSnapBack(useActive)` returns a `useSnapBack()` hook and a `<SnapBack>` Overlay component, built only on the public `status` + origin rect (no core internals), and is tree-shakeable — importing `drop-action` pulls none of it. This also establishes the subpath-entry packaging pattern (second build entry, dedicated `exports` condition with ESM/CJS + `.d.ts`/`.d.cts`) that future modules will follow.
