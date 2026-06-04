# Hooks are the primitive; components are sugar with asChild

Each Drop Action's headless core is a pair of hooks —
`useItem(id, data) → { ref, dragHandleProps, isDragging }` and
`useZone(id, { onDrop }) → { ref }` — that render no DOM of their own.
The consumer spreads `ref` and `dragHandleProps` onto their own element,
including semantic ones like `<tr>` or `<li>`. The `<Item>` and `<Zone>`
components are thin sugar over those hooks: by default they render a
wrapper element (`as="div"`), and `asChild` merges the props onto a
single child element instead, adding no node.

## Considered options

- **Wrapper-only components** — rejected as the only option. An extra DOM
  node per Item and Zone breaks semantic layouts (a `<div>` cannot sit
  between `<tbody>` and `<tr>`) and dents the headless promise.
- **`asChild`-only, no hook** — rejected. It forces exactly one element
  child and ref-merging as the sole path. The hook is the more honest
  zero-node primitive.
- **Render-prop as the primary API** — rejected. Children-as-function is
  verbose for the common case.
- **Hooks only, no components** — rejected. It loses the ergonomic JSX
  the original work API is built around.

## Consequences

Components stay tiny — each is `useItem`/`useZone` plus rendering — so
offering both surfaces costs little. The hook is the zero-node escape
hatch for tables, lists, and layout-sensitive markup.
