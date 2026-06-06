---
"drop-action": minor
---

Add an **Activation guard** — a `shouldStart?: (event: PointerEvent) => boolean` option on `createDropAction`, evaluated on the initial pointerdown before the activation constraint, deciding whether a press may become a drag at all (ADR-0016). Its default, exported as `defaultShouldStart`, refuses presses that begin on interactive content (`input`, `textarea`, `select`, `[contenteditable]`, matched with `closest()`) and on non-primary mouse buttons — so a click on a checkbox inside a whole-row Item, or a right-click, no longer hijacks into a drag. `<button>` is deliberately not vetoed, since a drag handle is often a button.

A custom `shouldStart` replaces the default; compose it to keep the defaults:

```ts
createDropAction({ shouldStart: (e) => defaultShouldStart(e) && mine(e) })
// drag from anywhere:
createDropAction({ shouldStart: () => true })
```

Behaviour change: with no `shouldStart`, drags that previously began on a form control inside an Item now don't. Pass `shouldStart: () => true` to restore the old "drag from anywhere" behaviour.
