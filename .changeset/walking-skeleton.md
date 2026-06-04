---
"drop-action": minor
---

Walking skeleton: the first end-to-end drop → accept path. `createDropAction(id)` returns a namespace (`Item`, `Zone`, `Active`, plus `useItem`/`useZone`/`useActive`) built on a custom Pointer Events engine, a closure-scoped `useSyncExternalStore` store, an injectable `measure` boundary, and a `document.body`-portalled Overlay. A Drop resolves through the Zone's `onDrop(item, respond)`; `respond('accepted')` runs the Item's `onAccept`.
