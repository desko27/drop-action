import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { ActiveSnapshot, DraggedItem } from './main'

// drop-action/snap-back — the opt-in Reject animation (CONTEXT.md —
// Snap-back). It is the first subpath module: tree-shakeable, built ONLY
// on the public reactive read (`useActive`) and the `status` + origin rect
// it exposes. It imports nothing from the headless core's internals, so a
// consumer who never imports `drop-action/snap-back` pulls none of it.
//
// Why a factory. The public reactive reads are per-Drop-Action — `useActive`
// is returned by `createDropAction`. Snap-back is generic across Drop
// Actions, so it takes the Drop Action's `useActive` and closes over it,
// mirroring how the core's namespace is produced (ADR-0005).
//
// How the bounce works, using only public state. The core never tells us
// "accepted" vs "rejected" — both end with `useActive()` returning null.
// But the two paths differ observably in the rendered `status`:
//   - A *Reject* over a Zone enters the Dropping phase first: `useActive()`
//     renders `status: 'dropping'` (the Overlay persists across the async
//     gap, ADR-0004), then the store resets to null.
//   - An *Accept* runs the Item's `onAccept` and resets; a synchronous
//     accept never lets the 'dropping' snapshot render at all.
// So snap-back records the last transform it saw while `status` was
// 'dropping'. When `useActive()` then drops to null *after* a rendered
// Dropping phase, that is a Reject: it mounts a short-lived ghost Overlay
// at the captured transform and, on the next frame, transitions it back to
// the origin rect (transform -> 0). On Accept (no rendered Dropping phase)
// there is nothing to bounce, so it does not snap back.

const DEFAULT_DURATION_MS = 200
const DEFAULT_EASING = 'cubic-bezier(0.2, 0, 0, 1)'

export type SnapBackOptions = {
  // How long the bounce animation runs, in milliseconds.
  durationMs?: number
  // The CSS transition timing function used for the bounce.
  easing?: string
}

// The headless result the `useSnapBack` hook returns. `transform` is the
// live Overlay translate (origin rect + delta); `transition` is the CSS
// transition string that is empty while dragging and set during the bounce.
export type SnapBackState<Data> = {
  // The Active snapshot while a drag is live, else null. During a bounce
  // this is null (the drag already ended) but `snapping` is true.
  active: ActiveSnapshot<Data> | null
  // True only while the Reject bounce is animating.
  snapping: boolean
  // The dragged Item being bounced (kept available through the bounce so a
  // ghost Overlay can render the same content), else null.
  item: DraggedItem<Data> | null
  // The Overlay style: absolute translate plus the bounce transition. Spread
  // onto the Overlay element so it follows the pointer, then eases to origin.
  style: CSSProperties
}

type UseActive<Data> = () => ActiveSnapshot<Data> | null

// Build a snap-back helper bound to one Drop Action. Pass the Drop Action's
// `useActive` (e.g. `createSnapBack(myAction.useActive)`), so the helper is
// reusable across Drop Actions while touching only public reads.
export function createSnapBack<Data>(
  useActive: UseActive<Data>,
  options: SnapBackOptions = {},
) {
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS
  const easing = options.easing ?? DEFAULT_EASING

  function useSnapBack(): SnapBackState<Data> {
    const active = useActive()

    // What the bounce needs to keep rendering after the drag ends: the
    // origin rect, the last transform, and the dragged Item.
    const lastDropping = useRef<{
      originRect: ActiveSnapshot<Data>['originRect']
      transform: { x: number; y: number }
      item: DraggedItem<Data>
    } | null>(null)
    // True once we have seen a rendered 'dropping' snapshot for the current
    // drag — the signal that the resolution actually went through the
    // Dropping phase (so a reset-to-null is a Reject worth bouncing).
    const sawDropping = useRef(false)

    // `phase` drives the ghost Overlay: 'start' paints it at the captured
    // transform (no transition) for one frame; 'home' flips on the
    // transition and the origin target so it eases back.
    const [phase, setPhase] = useState<'idle' | 'start' | 'home'>('idle')

    // Track the live drag. Record the transform whenever we render a
    // 'dropping' snapshot; reset the per-drag flags when a new drag starts.
    if (active) {
      if (active.status === 'dragging') {
        sawDropping.current = false
      } else if (active.status === 'dropping') {
        sawDropping.current = true
      }
      lastDropping.current = {
        originRect: active.originRect,
        transform: active.transform,
        item: { id: active.id, data: active.data },
      }
    }

    // The drag just ended after a rendered Dropping phase -> Reject. Kick
    // off the bounce: first paint at the captured transform, then ease home.
    useEffect(() => {
      if (active === null && sawDropping.current && phase === 'idle') {
        sawDropping.current = false
        setPhase('start')
      }
    }, [active, phase])

    // One frame after 'start', flip to 'home' so the browser interpolates
    // the transform from the captured delta to the origin (0,0).
    useEffect(() => {
      if (phase !== 'start') return
      const id = requestAnimationFrame(() => setPhase('home'))
      return () => cancelAnimationFrame(id)
    }, [phase])

    // Tear the ghost down once the transition has run its course.
    useEffect(() => {
      if (phase !== 'home') return
      const id = setTimeout(() => setPhase('idle'), durationMs)
      return () => clearTimeout(id)
    }, [phase])

    const snapping = phase !== 'idle'

    // Live drag: follow the pointer with no transition.
    if (active) {
      const x = active.originRect.left + active.transform.x
      const y = active.originRect.top + active.transform.y
      return {
        active,
        snapping: false,
        item: { id: active.id, data: active.data },
        style: overlayStyle(x, y, ''),
      }
    }

    // Bouncing: render the captured Item at the captured transform, then at
    // the origin once 'home' engages — the transition does the animation.
    if (snapping && lastDropping.current) {
      const { originRect, transform, item } = lastDropping.current
      const atHome = phase === 'home'
      const x = originRect.left + (atHome ? 0 : transform.x)
      const y = originRect.top + (atHome ? 0 : transform.y)
      return {
        active: null,
        snapping: true,
        item,
        style: overlayStyle(
          x,
          y,
          atHome ? `transform ${durationMs}ms ${easing}` : '',
        ),
      }
    }

    return { active: null, snapping: false, item: null, style: overlayStyle() }
  }

  type SnapBackProps = {
    // Renders the Overlay/ghost content for the dragged Item. Receives the
    // dragged { id, data } — the same shape the core's <Active> yields.
    children: (item: DraggedItem<Data>) => ReactNode
    className?: string
    // Overrides the portal target. Defaults to `document.body`, matching the
    // core Overlay (ADR-0010).
    container?: Element | DocumentFragment
  }

  // A drop-in replacement for the core's <Active>: it renders the Overlay
  // while dragging AND keeps a ghost mounted through the Reject bounce. Use
  // this instead of <Action.Active> to get snap-back for free.
  function SnapBack({ children, className, container }: SnapBackProps) {
    const { item, style } = useSnapBack()
    if (!item) return null

    return createPortal(
      <div className={className} style={style}>
        {children(item)}
      </div>,
      container ?? document.body,
    )
  }

  return { useSnapBack, SnapBack }
}

// The shared Overlay style: portalled, fixed at (0,0), positioned purely by
// a compositor-friendly translate3d (ADR-0010). `transition` is empty during
// a live drag and set to animate `transform` during the bounce.
function overlayStyle(x = 0, y = 0, transition = ''): CSSProperties {
  return {
    position: 'fixed',
    top: 0,
    left: 0,
    transform: `translate3d(${x}px, ${y}px, 0)`,
    transition,
    pointerEvents: 'none',
  }
}
