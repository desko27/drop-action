import type { GrabAnchorPoint } from './types.public'

// The Overlay's centre — the pointer sits at the middle of the travelling
// Overlay (CONTEXT.md — Grab anchor, ADR-0021). Sugar for `{ x: 0.5, y: 0.5 }`
// passed as `grabAnchor`.
export const center: GrabAnchorPoint = { x: 0.5, y: 0.5 }
