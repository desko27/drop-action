import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type {
  ActiveSnapshot,
  DraggedItem,
  DropOutcome,
  OverlayProps,
  Resolution,
} from './main'

// drop-action/snap-back — the opt-in Return animation (CONTEXT.md —
// Snap-back). It is the first subpath module: tree-shakeable, built ONLY on
// the public surface the core exposes — `useActive` for the live drag,
// `useResolution` for how it ended, and `useOverlay` so the live ghost rides
// the engine's imperative Overlay movement (ADR-0018) exactly like `<Active>`.
// It imports nothing from the headless core's internals, so a consumer who
// never imports `drop-action/snap-back` pulls none of it.
//
// Why an Extension (ADR-0025). Those reads are per-Drop-Action — `useActive`,
// `useResolution`, `useOverlay` are returned by `createDropAction`. Snap-back is
// generic across Drop Actions, so `snapBack(options)` returns a function that
// takes the channel and closes over its reads. Inject it via
// `.extend(snapBack())` to get `DA.ActiveSnapBack` / `DA.useActiveSnapBack`
// under the namespace, or apply it by hand with `snapBack()(DA)`.
//
// How the bounce works. The core states the terminal outcome directly
// (ADR-0013): when a drag ends it publishes a `resolution` carrying the
// `outcome` ('accepted' | 'rejected' | 'no-drop' | 'cancelled') plus the
// origin rect and the Overlay's last transform. Snap-back animates a
// *Return* — every outcome except 'accepted'. The instant a non-accept
// resolution appears it mounts a short-lived ghost Overlay at the captured
// transform and, on the next frame, eases it back to its home rect — the
// Overlay centered on the source's live rect (ADR-0022) — i.e. transform -> 0.
// On an Accept there is nothing to return, so it does not
// bounce — no inference and no dependence on whether a Dropping phase
// happened to render, so even an async Accept stays put.

const DEFAULT_DURATION_MS = 200
const DEFAULT_EASING = 'cubic-bezier(0.2, 0, 0, 1)'

export type SnapBackOptions = {
  // How long the bounce animation runs, in milliseconds.
  durationMs?: number
  // The CSS transition timing function used for the bounce.
  easing?: string
}

// The reactive reads Snap-back is built on, all returned by the Drop Action's
// `createDropAction`. The `snapBack()` Extension narrows the injected channel to
// this slice. `useOverlay` lets the live-drag ghost ride the engine's imperative
// Overlay movement (ADR-0018), the same as `<Active>`.
export type SnapBackReads<Data> = {
  useActive: () => ActiveSnapshot<Data> | null
  useResolution: () => Resolution<Data> | null
  useOverlay: () => OverlayProps
}

// The headless result the `useActiveSnapBack` hook returns. While a drag is live the
// engine moves the Overlay imperatively (ADR-0018), so `ref` is the Overlay ref
// to spread and `style` is the base; during the bounce `ref` is undefined and
// `style.transform` eases to the origin under `style.transition`.
export type SnapBackState<Data> = {
  // The Active snapshot while a drag is live, else null. During a bounce
  // this is null (the drag already ended) but `snapping` is true.
  active: ActiveSnapshot<Data> | null
  // True only while the Return bounce is animating.
  snapping: boolean
  // The dragged Item being bounced (kept available through the bounce so a
  // ghost Overlay can render the same content), else null.
  item: DraggedItem<Data> | null
  // Which Return is being animated ('rejected' | 'no-drop' | 'cancelled'),
  // else null. Exposed so a consumer can vary treatment per outcome (e.g.
  // skip the bounce on 'cancelled'); the <ActiveSnapBack> sugar treats them alike.
  outcome: DropOutcome | null
  // The Overlay style. While dragging it is the base style and the engine
  // writes the transform on the node; during the bounce it carries the
  // translate plus transition that eases the ghost back to origin.
  style: CSSProperties
  // The Overlay ref to spread while a drag is live (the engine moves the node);
  // undefined during the bounce, when this hook drives the transform via style.
  ref?: (node: HTMLElement | null) => void
}

// Build a snap-back helper bound to one Drop Action. Pass the Drop Action's
// reactive reads, so the helper is reusable across Drop Actions while
// touching only public state.
export function snapBack<Data = unknown>(options: SnapBackOptions = {}) {
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS
  const easing = options.easing ?? DEFAULT_EASING

  // The Extension (ADR-0025): receives the Drop Action's channel and reads the
  // three public hooks snap-back builds on. The channel's member set is open
  // (typed `unknown`), so narrow it to the reads we need — the same three
  // `SnapBackReads`.
  return (channel: unknown) => {
    const { useActive, useResolution, useOverlay } =
      channel as SnapBackReads<Data>

    function useActiveSnapBack(): SnapBackState<Data> {
      const active = useActive()
      const resolution = useResolution()
      const overlay = useOverlay()

      // The Return currently being animated, captured the instant a non-accept
      // resolution appears and held through the bounce. Read off `resolution`
      // (which lingers until the next drag) but kept here so a new drag
      // starting mid-bounce — which clears `resolution` — cannot pull it out
      // from under the animation.
      const bounce = useRef<Resolution<Data> | null>(null)

      // The resolution we have already reacted to. Seeded with whatever is
      // present on the first render so a resolution lingering from an earlier
      // drag never bounces a late-mounting consumer: we act on the *transition*
      // to a new resolution, not on its mere presence.
      const handled = useRef(resolution)

      // 'start' paints the ghost at the captured transform (no transition) for
      // one frame; 'home' flips the transition on and targets the origin so it
      // eases back; 'idle' is no bounce.
      const [phase, setPhase] = useState<'idle' | 'start' | 'home'>('idle')

      // Capture a fresh Return during render (not in an effect) so the ghost is
      // mountable on the very render the drag ends — no dropped frame between
      // Active going null and the bounce appearing. An Accept captures nothing.
      if (resolution !== handled.current) {
        handled.current = resolution
        bounce.current =
          resolution && resolution.outcome !== 'accepted' ? resolution : null
      }

      // Kick a freshly captured Return into the bounce. Keyed on `resolution`
      // so it fires exactly when a new one arrives; the render above has
      // already set `bounce.current` from that same `resolution`, so a truthy
      // ref here means "a Return to animate". An Accept left it null, so
      // nothing starts.
      useEffect(() => {
        if (resolution && bounce.current) setPhase('start')
      }, [resolution])

      // One frame after 'start', flip to 'home' so the browser interpolates the
      // transform from the captured delta to the origin (0,0).
      useEffect(() => {
        if (phase !== 'start') return
        const id = requestAnimationFrame(() => setPhase('home'))
        return () => cancelAnimationFrame(id)
      }, [phase])

      // Tear the ghost down once the transition has run its course.
      useEffect(() => {
        if (phase !== 'home') return
        const id = setTimeout(() => {
          bounce.current = null
          setPhase('idle')
        }, durationMs)
        return () => clearTimeout(id)
      }, [phase])

      // Live drag: the engine moves the Overlay node imperatively (ADR-0018), so
      // we hand back its ref + base style and never compute the transform here.
      if (active) {
        return {
          active,
          snapping: false,
          item: { id: active.id, data: active.data },
          outcome: null,
          style: overlay.style,
          ref: overlay.ref,
        }
      }

      // Returning: render the captured Item at the captured transform, then at
      // the origin once 'home' engages — the transition does the animation.
      // Keying the ghost off `bounce.current` (not off `phase`) keeps it
      // mounted across the render where Active first goes null but the kickoff
      // effect has not run yet, so the Overlay never blinks out.
      if (bounce.current) {
        const { homeRect, transform, item, outcome } = bounce.current
        const atHome = phase === 'home'
        const x = homeRect.left + (atHome ? 0 : transform.x)
        const y = homeRect.top + (atHome ? 0 : transform.y)
        return {
          active: null,
          snapping: true,
          item,
          outcome,
          style: overlayStyle(
            x,
            y,
            atHome ? `transform ${durationMs}ms ${easing}` : '',
          ),
        }
      }

      return {
        active: null,
        snapping: false,
        item: null,
        outcome: null,
        style: overlayStyle(),
      }
    }

    type ActiveSnapBackProps = {
      // Renders the Overlay/ghost content for the dragged Item. Receives the
      // dragged { id, data } — the same shape the core's <Active> yields.
      children: (item: DraggedItem<Data>) => ReactNode
      className?: string
      // Overrides the portal target. Defaults to `document.body`, matching the
      // core Overlay (ADR-0010).
      container?: Element | DocumentFragment
    }

    // A drop-in replacement for the core's <Active>: it renders the Overlay
    // while dragging AND keeps a ghost mounted through the Return bounce. Use
    // this instead of <Action.Active> to get snap-back for free; it bounces
    // uniformly on every Return. To vary treatment per outcome, read `outcome`
    // from `useActiveSnapBack()` and render the ghost yourself.
    function ActiveSnapBack({
      children,
      className,
      container,
    }: ActiveSnapBackProps) {
      const { item, style, ref, snapping } = useActiveSnapBack()
      if (!item) return null

      return createPortal(
        // `data-snapping` marks the Return bounce so a test/E2E can tell a
        // snap-back-in-progress from a live drag (mirrors `<Item data-dragging>`).
        <div
          ref={ref}
          className={className}
          style={style}
          data-snapping={snapping || undefined}
        >
          {children(item)}
        </div>,
        container ?? document.body,
      )
    }

    return { useActiveSnapBack, ActiveSnapBack }
  }
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
