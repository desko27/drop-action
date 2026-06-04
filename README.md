# drop-action

Zero-dependency, headless drag-and-drop primitives for React.

[![npm version](https://img.shields.io/npm/v/drop-action)](https://www.npmjs.com/package/drop-action)
[![CI](https://img.shields.io/github/actions/workflow/status/desko27/drop-action/ci.yml?branch=main)](https://github.com/desko27/drop-action/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

> **Status:** pre-1.0 and in active development. The API surface is stabilising toward `1.0.0`; expect breaking changes between minor versions until then.

## About

`drop-action` is a small, headless drag-and-drop toolkit for React. You call `createDropAction(id)` and get back a self-contained namespace of components and hooks (`Item`, `Zone`, `Active`, `useOver`, …) whose surface mirrors a dnd-kit-style API — but built on a custom Pointer Events engine with **no runtime dependencies** and **no Provider to wrap your tree in**.

Headless means it ships behaviour, not looks: it tracks the drag, decides which zone is under the pointer, and tells you how a drop resolved — you render every pixel. Drops resolve through an explicit, optionally-async `respond('accepted')` contract, so a zone can `await` a network call before accepting.

## Features

- **Zero runtime dependencies** — only React itself (peer dep, `>=18`).
- **Tiny and tree-shakeable** — size-budgeted core (≤ 3.25 KB min+gzip); opt-in extras live behind subpaths so you only pay for what you import.
- **No Provider** — `createDropAction(id)` closes over its own store; just render the components it returns ([ADR-0002](docs/adr/0002-closure-scoped-store-no-provider.md), [ADR-0005](docs/adr/0005-create-drop-action-returns-namespace.md)).
- **Headless** — no styles, no DOM you didn't ask for. Hooks are the primitive; the components are thin sugar with `asChild` support ([ADR-0008](docs/adr/0008-hook-primitive-component-sugar-aschild.md)).
- **Explicit, async-capable drops** — accept is opt-in (`respond('accepted')`); a zone may `await` before deciding ([ADR-0003](docs/adr/0003-async-drop-resolution-explicit-accept.md)).
- **Pointer Events engine** — one code path for mouse, pen and touch, with pointer-type-aware activation so taps, clicks and scrolls aren't hijacked ([ADR-0001](docs/adr/0001-pointer-events-drag-engine.md), [ADR-0012](docs/adr/0012-activation-constraint-per-action-pointer-aware.md)).
- **Pluggable collision detection** — `rectIntersection` (default), `pointerWithin`, `closestCenter`, or your own.
- **Composable modifiers** — `restrictToWindowEdges` (default), axis locks, `snapToGrid(size)`, or your own; the modifier pipeline drives both the overlay and collision ([ADR-0007](docs/adr/0007-modifiers-pipeline-drives-collision.md)).
- **Flexible drag handles** — the whole item by default, or a custom handle that can live anywhere in the tree ([ADR-0009](docs/adr/0009-drag-handles-no-registry.md)).
- **TypeScript-first** — generic over your item `data`; the dragged `{ id, data }` is typed end to end.
- **SSR-safe** — inert on the server, no DOM access until a drag begins.
- **Opt-in animation** — snap-back ships as a separate `drop-action/snap-back` module ([ADR-0004](docs/adr/0004-headless-core-optional-subpath-modules.md)).

## Installation

```bash
npm install drop-action
# or: pnpm add drop-action
# or: yarn add drop-action
```

### Requirements

- React `>=18` and React DOM `>=18` (peer dependencies)

## Usage

A draggable item, a zone that accepts it, and the overlay that travels with the pointer:

```tsx
import { createDropAction } from 'drop-action'

type Card = { label: string }

// One self-contained drag-and-drop channel. No Provider needed.
const DnD = createDropAction<Card>('cards')

function Board() {
  return (
    <>
      {/* The source item stays put; an overlay travels instead. */}
      <DnD.Item
        id="card-1"
        data={{ label: 'Drag me' }}
        onAccept={(item) => console.log('accepted', item.id)}
      >
        Drag me
      </DnD.Item>

      {/* A zone decides each drop. Calling respond('accepted') accepts;
          anything else (including never responding) is a reject. */}
      <DnD.Zone id="inbox" onDrop={(item, respond) => respond('accepted')}>
        Drop here
      </DnD.Zone>

      {/* The overlay: portalled to the body, follows the pointer. */}
      <DnD.Active>
        {({ data }) => <div className="overlay">{data.label}</div>}
      </DnD.Active>
    </>
  )
}
```

### Highlighting the active zone

`useOver(zoneId)` returns the dragged `{ id, data }` while that zone is the one under the pointer — truthy for exactly one zone at a time:

```tsx
function Inbox() {
  const over = DnD.useOver('inbox')
  return (
    <DnD.Zone
      id="inbox"
      onDrop={(_item, respond) => respond('accepted')}
      className={over ? 'zone zone--over' : 'zone'}
    >
      Drop here
    </DnD.Zone>
  )
}
```

### Async accept / reject

A zone can `await` before deciding. Returning without calling `respond('accepted')` is a reject:

```tsx
<DnD.Zone
  id="inbox"
  onDrop={async (item, respond) => {
    const ok = await saveOnServer(item.data)
    if (ok) respond('accepted') // otherwise the drop rejects
  }}
>
  Drop here
</DnD.Zone>
```

### Snap-back (opt-in module)

The core is unopinionated about animation. Import `drop-action/snap-back` to ease the overlay back to its origin on any **return** (a reject, a no-drop, or a cancel — every ending except an accept):

```tsx
import { createSnapBack } from 'drop-action/snap-back'

const { SnapBack } = createSnapBack({
  useActive: DnD.useActive,
  useResolution: DnD.useResolution,
})

// Use <SnapBack> in place of <DnD.Active>: it renders the overlay while
// dragging AND keeps a ghost mounted that animates home on a return.
<SnapBack>{({ data }) => <div className="overlay">{data.label}</div>}</SnapBack>
```

### Configuration

Pass options as the second argument to `createDropAction`:

```tsx
import { createDropAction, closestCenter, snapToGrid } from 'drop-action'

const DnD = createDropAction<Card>('cards', {
  collisionDetection: closestCenter,
  modifiers: [snapToGrid(20)],
  activationConstraint: {
    mouse: { distance: 5 },              // drag after moving 5px
    touch: { delay: 200, tolerance: 8 }, // press-and-hold to drag; swipe to scroll
  },
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `collisionDetection` | `rectIntersection` | Strategy that picks which zone is *over*. Also: `pointerWithin`, `closestCenter`, or your own `CollisionDetection`. |
| `modifiers` | `[restrictToWindowEdges]` | Pipeline that adjusts the overlay transform. Also: `restrictToVerticalAxis`, `restrictToHorizontalAxis`, `snapToGrid(size)`, or your own `Modifier`. |
| `activationConstraint` | pointer-type-aware | Movement distance / press delay a pointer must cross to start a drag. |
| `measure` | DOM `getBoundingClientRect` | Override how item/zone geometry is read (useful for tests and non-DOM strategies). |

## API

`createDropAction<Data>(id, options?)` returns a namespace:

| Member | Kind | Purpose |
|--------|------|---------|
| `Item` | component | A draggable element carrying typed `data` (sugar over `useItem`). |
| `Zone` | component | A droppable target (sugar over `useZone`). |
| `Active` | component | The overlay; renders the dragged item in flight via a portal. |
| `useItem(id, data, opts?)` | hook | Register a draggable; returns `{ ref, dragHandleProps, isDragging }`. |
| `useZone(id, opts?)` | hook | Register a droppable; returns `{ ref }`. |
| `useDragHandle(id)` | hook | Props for a custom handle that can live outside the item's subtree. |
| `useDropEvent(zoneId, handler)` | hook | Subscribe to a zone's drops from anywhere in the tree. |
| `useActive()` | hook | The item currently in flight (`{ id, data, status, … }`) or `null`. |
| `useOver(zoneId)` | hook | The dragged `{ id, data }` while `zoneId` is *over*, else `null`. |
| `useResolution()` | hook | How the last drag ended (`accepted` / `rejected` / `no-drop` / `cancelled`), kept until the next drag. |

A drag ends in exactly one terminal **outcome**: `accepted`, `rejected`, `no-drop`, or `cancelled`. The three non-accept endings form a **return** (what snap-back animates). See [`CONTEXT.md`](CONTEXT.md) for the full glossary.

## Documentation

- [`CONTEXT.md`](CONTEXT.md) — the domain glossary (Item, Zone, Active, Over, Return, …).
- [`docs/adr/`](docs/adr/) — architectural decision records explaining the *why* behind the design.

## Development

This is a pnpm monorepo. The published package lives in [`packages/drop-action`](packages/drop-action); a live demo lives in [`sites/demo`](sites/demo).

```bash
pnpm install      # install workspace deps
pnpm dev          # run the demo app (sites/demo)
pnpm test         # run the unit tests
pnpm build        # build the package
pnpm lint         # lint with Biome
pnpm check:types  # type-check the workspace
pnpm size         # check the bundle-size budgets
```

## Contributing

Contributions are welcome. Issues and PRDs are tracked as [GitHub issues on `desko27/drop-action`](https://github.com/desko27/drop-action/issues). Before working in an area, skim [`CONTEXT.md`](CONTEXT.md) for the shared vocabulary and the relevant [ADRs](docs/adr/) — the project keeps a deliberate, documented domain language, and changes are expected to fit it.

## Acknowledgments

- Public API surface inspired by [dnd-kit](https://github.com/clauderic/dnd-kit).
- The factory + opt-in subpath-module pattern follows [react-call](https://github.com/desko27/react-call).

## License

[MIT](https://opensource.org/licenses/MIT) © [Ismael Ramon](https://desko.dev)
