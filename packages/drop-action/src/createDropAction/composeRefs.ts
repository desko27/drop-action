import type { Ref } from 'react'

// Merge several refs into one callback ref so `asChild` can attach the
// Drop Action's ref alongside any ref the child already carries, without
// adding a wrapper node (ADR-0008). Handles both callback and object refs;
// ignores null/undefined slots.
export function composeRefs<T>(
  ...refs: (Ref<T> | undefined)[]
): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node)
      else if (ref != null) (ref as { current: T | null }).current = node
    }
  }
}
