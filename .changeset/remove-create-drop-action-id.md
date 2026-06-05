---
"drop-action": major
---

**Breaking:** `createDropAction` no longer takes an `id` argument. Its signature is now `createDropAction(options?)` — options moves into the first parameter.

The id was vestigial: it was carried over from dnd-kit, where a single shared `DndContext` needs an id to keep separate experiences from crossing. Here each `createDropAction()` closes over its own store and Item/Zone registries (ADR-0002, ADR-0005), so isolation is structural — two Drop Actions can never see each other regardless of any id, and the argument was never read internally.

```tsx
// before
const DnD = createDropAction('kanban', { collisionDetection: closestCenter })

// after
const DnD = createDropAction({ collisionDetection: closestCenter })
```

Item and Zone ids are unchanged — they remain load-bearing (registry keys, drop identity, `useOver`/`useDragHandle` addressing).
