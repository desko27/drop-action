import type { Modifier } from './types.public'

// Built-in Modifiers (ADR-0007). Each is a pure `(args) => Transform`, free
// of DOM access — the engine injects the pointer and window dims — so they
// stay tree-shakeable and unit-testable against synthetic geometry.

// Clamp the transform so the Overlay rect (the origin rect translated by
// the transform) cannot leave the viewport. Only constrains when the
// Overlay would otherwise exit an edge, so an Overlay already inside the
// window is left untouched. The default modifier.
export const restrictToWindowEdges: Modifier = ({
  transform,
  originRect,
  windowWidth,
  windowHeight,
}) => {
  let { x, y } = transform

  // Left/top edges: don't let the leading edge cross 0.
  const minX = -originRect.left
  const minY = -originRect.top
  // Right/bottom edges: don't let the trailing edge cross the viewport.
  const maxX = windowWidth - originRect.right
  const maxY = windowHeight - originRect.bottom

  if (x < minX) x = minX
  if (x > maxX) x = maxX
  if (y < minY) y = minY
  if (y > maxY) y = maxY

  return { x, y }
}

// Pin the Overlay to a single axis by zeroing the cross-axis delta.
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  x: 0,
  y: transform.y,
})

export const restrictToHorizontalAxis: Modifier = ({ transform }) => ({
  x: transform.x,
  y: 0,
})

// Factory: snap the transform to the nearest multiple of `size` on both
// axes, so the Overlay steps across a grid rather than tracking the
// pointer continuously.
export const snapToGrid =
  (size: number): Modifier =>
  ({ transform }) => ({
    x: Math.round(transform.x / size) * size,
    y: Math.round(transform.y / size) * size,
  })
