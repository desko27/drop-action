import type { Rect } from './types.public'

export type ZoneRect = { id: string; rect: Rect }

export type CollisionArgs = {
  overlayRect: Rect
  zones: ZoneRect[]
}

const intersectionArea = (a: Rect, b: Rect): number => {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return width > 0 && height > 0 ? width * height : 0
}

// Default collision detection (ADR-0006): the Zone whose rect overlaps the
// post-modifier Overlay rect by the largest area wins. Returns a single
// winning `zoneId` or `null` — Over is singular by design. Pure, so it is
// one of the two test seams the whole engine is verified through.
export const rectIntersection = ({
  overlayRect,
  zones,
}: CollisionArgs): string | null => {
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
