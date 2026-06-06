import type { Rect } from './types.public'

// Clipping the Zone's collision rect to its visible region (ADR-0023). A Zone
// inside an `overflow` scroll container has part of itself scrolled out behind
// the container's edge; `getBoundingClientRect` still reports that hidden part,
// so collision would fire from a region the user cannot see. We intersect the
// raw rect with each clipping ancestor's box (and the viewport) so only the
// visible part can be Over. Only geometric clipping is in scope — not occlusion
// by elements painted on top, which the pure rect model cannot express.

// An ancestor clips its descendants when its overflow on any axis is
// `scroll`/`auto` (clipped behind the scroll viewport) or `hidden`/`clip`
// (clipped outright). One regex over the shorthand and both longhands covers
// every DOM implementation, whether or not it expands the `overflow` shorthand.
const CLIPS = /auto|scroll|hidden|clip/

// Walk up from the Zone node collecting every clipping ancestor, stopping at the
// first `position: fixed` element — its containing block is the viewport, so a
// scroll ancestor above it never clips it. The viewport (the root clipper) is
// applied by `clipToVisible`, not collected here. Resolved once per Zone at drag
// start and cached (ADR-0023): the walk needs `getComputedStyle` (it forces
// style), but only the ancestors' positions — not the DOM shape — change as the
// page scrolls.
export const resolveClippers = (node: Element): Element[] => {
  const clippers: Element[] = []
  for (let el = node.parentElement; el; el = el.parentElement) {
    const s = getComputedStyle(el)
    if (CLIPS.test(s.overflow + s.overflowX + s.overflowY)) clippers.push(el)
    if (s.position === 'fixed') break
  }
  return clippers
}

// The Zone's clipped rect (ADR-0023): its raw rect intersected with the viewport
// (the root clipper) and every clipping ancestor's box. Returns `null` when
// nothing is left — a Zone clipped to nothing is not a collision candidate, so
// no detector (including `closestCenter`, which has no overlap requirement) can
// pick a Zone the user cannot see.
export const clipToVisible = (raw: Rect, clippers: Element[]): Rect | null => {
  let { left, top, right, bottom } = raw
  const clamp = (
    b: DOMRect | { left: number; top: number; right: number; bottom: number },
  ) => {
    left = Math.max(left, b.left)
    top = Math.max(top, b.top)
    right = Math.min(right, b.right)
    bottom = Math.min(bottom, b.bottom)
  }
  clamp({
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  })
  for (const c of clippers) clamp(c.getBoundingClientRect())
  const width = right - left
  const height = bottom - top
  return width > 0 && height > 0
    ? { left, top, right, bottom, width, height }
    : null
}
