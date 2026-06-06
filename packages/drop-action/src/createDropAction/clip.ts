import type { Rect } from './types.public'

// Clipping the Zone's collision rect to its visible region (ADR-0023). A Zone
// inside an `overflow` scroll container has part of itself scrolled out behind
// the container's edge; `getBoundingClientRect` still reports that hidden part,
// so collision would fire from a region the user cannot see. We intersect the
// raw rect with each clipping ancestor's box (and the viewport) so only the
// visible part can be Over. Only geometric clipping is in scope — not occlusion
// by elements painted on top, which the pure rect model cannot express.

// An ancestor clips its descendants when its overflow on either axis is one of
// these: `scroll`/`auto` clip the overflow behind the scroll viewport,
// `hidden`/`clip` clip it outright.
const CLIPPING_OVERFLOW = new Set(['scroll', 'auto', 'hidden', 'clip'])

// Walk up from the Zone node collecting every ancestor that clips, stopping at
// the first `position: fixed` element — its containing block is the viewport, so
// a scroll ancestor above it never clips it. The viewport itself is the root
// clipper, applied by `clipToVisible`, not collected here. Resolved once per
// Zone at drag start and cached (ADR-0023): discovering the chain needs
// `getComputedStyle` (it forces style), but only the ancestors' positions — not
// the DOM shape — change as the page scrolls.
export const resolveClippers = (node: Element): Element[] => {
  const clippers: Element[] = []
  let el = node.parentElement
  while (el) {
    // Read the shorthand and both longhands: browsers resolve overflow to the
    // longhands, but not every DOM implementation expands the shorthand, so we
    // treat a clipping value on any of the three as clipping.
    const style = getComputedStyle(el)
    if (
      CLIPPING_OVERFLOW.has(style.overflow) ||
      CLIPPING_OVERFLOW.has(style.overflowX) ||
      CLIPPING_OVERFLOW.has(style.overflowY)
    ) {
      clippers.push(el)
    }
    if (style.position === 'fixed') break
    el = el.parentElement
  }
  return clippers
}

const intersect = (
  a: Rect,
  b: { left: number; top: number; right: number; bottom: number },
): Rect => {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const right = Math.min(a.right, b.right)
  const bottom = Math.min(a.bottom, b.bottom)
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

// The Zone's clipped rect (ADR-0023): its raw rect intersected with the viewport
// (the root clipper) and every clipping ancestor's border box. Returns `null`
// when the result has no area — a Zone clipped to nothing is not a collision
// candidate, so no detector (including `closestCenter`, which has no overlap
// requirement) can pick a Zone the user cannot see.
export const clipToVisible = (raw: Rect, clippers: Element[]): Rect | null => {
  let r = intersect(raw, {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  })
  for (const clipper of clippers) {
    if (r.width <= 0 || r.height <= 0) break
    r = intersect(r, clipper.getBoundingClientRect())
  }
  return r.width > 0 && r.height > 0 ? r : null
}
