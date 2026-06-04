import type { Rect } from './types.public'

export type ZoneRect = { id: string; rect: Rect }

// The collision contract (ADR-0006): a pure detector receives the live
// pointer, the post-modifier Overlay rect, and the Drop Action's Zone-rect
// snapshot, and returns a single winning `zoneId` or `null` — Over is
// singular by design. Detectors are pure, so they are one of the test seams
// the whole engine is verified through.
export type CollisionArgs = {
  pointer: { x: number; y: number }
  overlayRect: Rect
  zones: ZoneRect[]
}

export type CollisionDetection = (args: CollisionArgs) => string | null

const intersectionArea = (a: Rect, b: Rect): number => {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return width > 0 && height > 0 ? width * height : 0
}

const centerOf = (rect: Rect) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
})

const distanceSquared = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

// Default collision detection: the Zone whose rect overlaps the
// post-modifier Overlay rect by the largest area wins. Ignores the pointer.
export const rectIntersection: CollisionDetection = ({
  overlayRect,
  zones,
}) => {
  let winner: string | null = null
  let best = 0
  for (const { id, rect } of zones) {
    const area = intersectionArea(overlayRect, rect)
    if (area > best) {
      best = area
      winner = id
    }
  }
  return winner
}

// The Zone whose rect contains the pointer wins. When several Zones contain
// it (overlapping Zones), the one whose center is closest to the pointer
// wins; ties resolve to the first such Zone in registration order.
export const pointerWithin: CollisionDetection = ({ pointer, zones }) => {
  let winner: string | null = null
  let best = Number.POSITIVE_INFINITY
  for (const { id, rect } of zones) {
    const inside =
      pointer.x >= rect.left &&
      pointer.x <= rect.right &&
      pointer.y >= rect.top &&
      pointer.y <= rect.bottom
    if (!inside) continue
    const d = distanceSquared(pointer, centerOf(rect))
    if (d < best) {
      best = d
      winner = id
    }
  }
  return winner
}

// The Zone whose center is nearest the Overlay rect's center wins. Always
// returns a Zone when any exist (no overlap requirement); ties resolve to
// the first such Zone in registration order.
export const closestCenter: CollisionDetection = ({ overlayRect, zones }) => {
  const overlayCenter = centerOf(overlayRect)
  let winner: string | null = null
  let best = Number.POSITIVE_INFINITY
  for (const { id, rect } of zones) {
    const d = distanceSquared(overlayCenter, centerOf(rect))
    if (d < best) {
      best = d
      winner = id
    }
  }
  return winner
}
