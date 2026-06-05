---
"drop-action": major
---

**Breaking:** the `asChild` prop is removed from `<Item>` and `<Zone>`. It was redundant with the hooks — `useItem`/`useZone` already render no DOM of their own — and its `cloneElement` + ref/prop-merge machinery cost ~225 B (~9%) of the core bundle that every consumer paid, imported or not (ADR-0008).

For a zero-extra-node layout (tables, lists, semantic markup), use the hook directly and spread `ref` + `dragHandleProps` onto your own element — composing any `ref`/handler the element already carries yourself:

```tsx
// before
<DnD.Item id="row" data={d} asChild>
  <tr className="row">…</tr>
</DnD.Item>

// after
const { ref, dragHandleProps, isDragging } = DnD.useItem('row', d)
<tr
  ref={ref}
  className="row"
  data-dragging={isDragging || undefined}
  {...dragHandleProps}
>
  …
</tr>
```

`as` (wrapper element/component, default `'div'`), `customDragHandle`, and `useDragHandle` are unchanged.
