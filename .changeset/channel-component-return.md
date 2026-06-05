---
"drop-action": minor
---

`createDropAction()` now returns the Drop Action as a **function component** that carries `Item`, `Zone`, `Active` and the hooks as members, instead of a plain namespace object (ADR-0015). The dot-notation API is unchanged — keep using `DnD.Item`, `DnD.Zone`, `DnD.useOver`, … exactly as before, so existing code compiles and runs without changes.

Why: React Fast Refresh only treats a module as a refresh boundary when every export is component-like. A plain-object export is not, so a shared `export const DnD = createDropAction()` module forced a **full page reload** on every edit in Next.js / Vite. A component-shaped return makes that module a boundary, so editing it remounts the Drop Action subtree instead of reloading the page.

The returned value is the channel itself and is not meant to be rendered: `<DnD>` warns in development and renders nothing — render its members instead.
