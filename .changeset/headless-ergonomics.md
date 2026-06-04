---
"drop-action": minor
---

Headless ergonomics: `useItem`/`useZone` are first-class, well-typed primitives usable with no wrapper node (spread `ref` + props onto a `<tr>`/`<li>`). `Item`/`Zone` gain `as` (wrapper element/component, default `'div'`) and `asChild` (merge ref + props onto a single child via `cloneElement`, adding no DOM node). New `customDragHandle` option makes the Item a `role="group"` container that registers and travels but does not itself trigger a drag; the new `useDragHandle(id)` hook places the trigger anywhere — including outside the Item's subtree — with no registry (ADR-0009). Drag handles keep the ARIA defaults (`role`, `tabIndex`, `aria-roledescription`) and defensive CSS (`touch-action: none`, `user-select: none`) per ADR-0011.
