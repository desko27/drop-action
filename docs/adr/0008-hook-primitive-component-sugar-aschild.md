# Hooks are the primitive; components are sugar

Each Drop Action's headless core is a pair of hooks —
`useItem(id, data) → { ref, dragHandleProps, isDragging }` and
`useZone(id, { onDrop }) → { ref }` — that render no DOM of their own.
The consumer spreads `ref` and `dragHandleProps` onto their own element,
including semantic ones like `<tr>` or `<li>`. The `<Item>` and `<Zone>`
components are thin sugar over those hooks: they render a wrapper element
whose tag is chosen with `as` (default `'div'`).

## Considered options

- **Wrapper-only components** — rejected as the only option. An extra DOM
  node per Item and Zone breaks semantic layouts (a `<div>` cannot sit
  between `<tbody>` and `<tr>`) and dents the headless promise. The hook,
  not the component, is the zero-node answer.
- **`asChild` (merge props onto a single child via `cloneElement`)** —
  shipped initially, then removed. It is redundant with the hook — both
  solve the zero-node case — and its merge machinery (`cloneElement`,
  ref/prop composition) cost ~225 B (~9%) of the core bundle that every
  consumer paid, imported or not. The hook is the more honest zero-node
  primitive, so it is the *sole* zero-node path; `asChild` is not re-added.
- **Render-prop as the primary API** — rejected. Children-as-function is
  verbose for the common case.
- **Hooks only, no components** — rejected. It loses the ergonomic JSX
  the original work API is built around.

## Consequences

Components stay tiny — each is `useItem`/`useZone` plus rendering. For a
zero-extra-node layout (tables, lists, layout-sensitive markup) the
consumer reaches for the hook directly, spreading `ref` + `dragHandleProps`
onto their own `<tr>`/`<li>` and composing any `ref`/handler the element
already carries themselves — the convenience `asChild` used to absorb.
