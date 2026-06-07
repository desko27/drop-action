import type { ActiveSnapshot, Resolution } from './types.private'
import type { DraggedItem } from './types.public'

// Per-Drop-Action store created inside the createDropAction closure (no
// provider, ADR-0002). It holds only low-frequency drag state — `active`,
// `over`, `resolution` — emitted on transitions, never per frame: the Overlay's
// per-frame transform is moved imperatively and stays out of React (ADR-0018).
//
// Each read returns a stable or primitive value so React's `useSyncExternalStore`
// bails a consumer out (via `Object.is`) unless its own slice changed: an Over
// transition then re-renders only the two Zones whose membership flips, not
// every Zone reading a shared snapshot.
export function createStore<Data>() {
  let active: ActiveSnapshot<Data> | null = null
  let over: string | null = null
  // The single Hover target the drag's cursor is currently inside (ADR-0024),
  // resolved in a pass separate from `over` so it never affects Drop
  // resolution. Like `over`, it is emitted on transitions only (ADR-0018).
  let hover: string | null = null
  let resolution: Resolution<Data> | null = null
  // The dragged { id, data } derived from `active`, cached so `useOver` returns
  // a referentially-stable value while the Active Item is unchanged.
  let item: DraggedItem<Data> | null = null

  const listeners = new Set<() => void>()
  const emit = () => {
    for (const listener of listeners) listener()
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    // Selective client reads.
    getActive: () => active,
    getResolution: () => resolution,
    getOverItem: (zoneId: string): DraggedItem<Data> | null =>
      over === zoneId ? item : null,
    isActiveId: (id: string) => active?.id === id,
    // Whether `id` is the current Hover target — a boolean, so a Hover target
    // re-renders only when its own membership flips (ADR-0018, ADR-0024).
    isHoverId: (id: string) => hover === id,

    // Inert, document-free server reads (ADR-0002, ADR-0011). Each returns a
    // constant, so it is trivially stable across calls.
    getServerActive: () => null,
    getServerResolution: () => null,
    getServerOverItem: () => null,
    getServerIsActiveId: () => false,
    getServerIsHoverId: () => false,

    // The engine's only write. Just the supplied keys change, so `active` keeps
    // its reference across an Over-only change (no `useActive` re-render then);
    // `item` is recomputed only when `active` is. Emits once.
    commit: (next: {
      active?: ActiveSnapshot<Data> | null
      over?: string | null
      hover?: string | null
      resolution?: Resolution<Data> | null
    }) => {
      if ('active' in next) {
        active = next.active ?? null
        item = active ? { id: active.id, data: active.data } : null
      }
      if ('over' in next) over = next.over ?? null
      if ('hover' in next) hover = next.hover ?? null
      if ('resolution' in next) resolution = next.resolution ?? null
      emit()
    },
  }
}

export type Store<Data> = ReturnType<typeof createStore<Data>>
