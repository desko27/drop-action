import type { DropActionState } from './types.private'

// The single inert snapshot: no active drag, no Over. Shared by the idle
// client state and the server snapshot, and never mutated, so
// useSyncExternalStore sees a stable reference and does not loop
// (ADR-0002). Frozen to make that contract enforced, not just intended.
const INERT: DropActionState<unknown> = Object.freeze({
  active: null,
  over: null,
})

// Per-Drop-Action store created inside the createDropAction closure (no
// provider). Holds only ephemeral, client-only drag state.
export function createStore<Data>() {
  let state = INERT as DropActionState<Data>
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => state,
    // Inert, stable, document-free server snapshot (ADR-0002, ADR-0011):
    // server rendering yields no active drag and touches no DOM.
    getServerSnapshot: () => INERT as DropActionState<Data>,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setState: (next: DropActionState<Data>) => {
      state = next
      emit()
    },
    reset: () => {
      state = INERT as DropActionState<Data>
      emit()
    },
  }
}

export type Store<Data> = ReturnType<typeof createStore<Data>>
