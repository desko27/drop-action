---
"drop-action": minor
---

Add a grab/grabbing cursor affordance (ADR-0019). The drag handle now shows `cursor: grab` at rest, and the whole document shows `cursor: grabbing` while a drag is live — the latter via a global `<style>` injected for the drag's duration, because a captured pointer roams the page and a handle-local cursor would flicker to whatever is under it. It is on by default; pass `createDropAction({ grabCursor: false })` to take full control of the cursor yourself (the library then touches no cursor — useful if you drive per-Zone cursors like `no-drop`).

Behaviour change: handles now get `cursor: grab` by default and a global `grabbing` cursor appears during drags. Set `grabCursor: false` to opt out.
