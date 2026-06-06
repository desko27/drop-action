import {
  type CSSProperties,
  type ElementType,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { defaultShouldStart } from './activation'
import { rectIntersection } from './collision'
import { createEngine } from './engine'
import { defaultMeasure } from './measure'
import { restrictToWindowEdges } from './modifiers'
import { createStore } from './store'
import type {
  ActiveSnapshot,
  ItemRegistration,
  OverlayRegistry,
  Resolution,
  ZoneRegistration,
} from './types.private'
import type {
  CreateDropActionOptions,
  DraggedItem,
  DragHandleProps,
  ItemHandleProps,
  OverlayProps,
  UseItemOptions,
  ZoneDropHandler,
} from './types.public'

// The handle is grabbable but does NOT statically suppress touch scrolling
// (ADR-0012): a touch list must stay scrollable until a press-and-hold
// actually starts a drag. `touch-action: none` is therefore applied only
// while this Item is being dragged (see `dragHandleProps.style` below), so a
// quick swipe scrolls and the engine's pending-activation phase decides
// whether the press becomes a drag.
const HANDLE_STYLE: CSSProperties = {
  userSelect: 'none',
}

const DRAGGING_HANDLE_STYLE: CSSProperties = {
  ...HANDLE_STYLE,
  touchAction: 'none',
}

// The Overlay's base style (ADR-0010): portalled, fixed at (0,0), inert to the
// pointer. The `translate3d` is written imperatively by the engine on the
// node's ref (ADR-0018), so it is deliberately absent here — putting it in this
// React-managed style would fight the per-frame imperative writes.
const OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  pointerEvents: 'none',
}

type ItemProps<Data, Accept = void, Reject = void> = {
  id: string
  data: Data
  onAccept?: (item: DraggedItem<Data>, payload: Accept) => void
  onReject?: (item: DraggedItem<Data>, payload: Reject) => void
  customDragHandle?: boolean
  as?: ElementType
  className?: string
  children?: ReactNode
}

type ZoneProps<Data, Accept = void, Reject = void> = {
  id: string
  // 1 Zone = 1 onDrop (ADR-0014). Optional: a Zone with no handler is still
  // measurable and simply Rejects any Drop.
  onDrop?: ZoneDropHandler<Data, Accept, Reject>
  as?: ElementType
  className?: string
  children?: ReactNode
}

type ActiveProps<Data> = {
  children: (item: DraggedItem<Data>) => ReactNode
  className?: string
  // Overrides the portal target (Shadow DOM, a dialog). Defaults to
  // `document.body` (ADR-0010).
  container?: Element | DocumentFragment
}

// The factory: returns the Drop Action as a channel component carrying the
// peer components (`Zone`, `Item`, `Active`) + hooks as members (ADR-0015).
// The store is closure-scoped, so only this Drop Action's Items and Zones
// see each other — isolation is structural, so no channel id is needed
// (ADR-0002, ADR-0005).
export function createDropAction<Data = unknown, Accept = void, Reject = void>(
  options: CreateDropActionOptions = {},
) {
  const measure = options.measure ?? defaultMeasure
  // Default to keeping the Overlay inside the viewport (ADR-0007). The
  // pipeline drives both the Overlay transform and collision, so the
  // default never lets Over register where the Overlay cannot reach.
  const modifiers = options.modifiers ?? [restrictToWindowEdges]
  // Default collision detection is `rectIntersection` (ADR-0006); a custom
  // detector or another built-in can be supplied per Drop Action.
  const collisionDetection = options.collisionDetection ?? rectIntersection
  // Default Activation guard refuses interactive-origin / non-primary presses
  // (ADR-0016); a custom `shouldStart` replaces it (compose `defaultShouldStart`
  // to keep the defaults).
  const shouldStart = options.shouldStart ?? defaultShouldStart
  const store = createStore<Data>()

  // Item ids and Zone ids occupy separate id spaces — two maps — so an
  // Item and a Zone may safely share an id (ADR-0005). These registries
  // are mutable and non-reactive: registering a node triggers no render. A
  // Zone carries its single onDrop with its node (ADR-0014).
  const items = new Map<string, ItemRegistration<Data, Accept, Reject>>()
  const zones = new Map<string, ZoneRegistration<Data, Accept, Reject>>()

  // The shared handle on the rendered Overlay node (ADR-0017, ADR-0018): the
  // `useOverlay` ref sets `node`; the engine sets `place` while a drag is live.
  const overlay: OverlayRegistry = { node: null, place: null }

  const engine = createEngine<Data, Accept, Reject>({
    items,
    zones,
    measure,
    modifiers,
    collisionDetection,
    activationConstraint: options.activationConstraint,
    shouldStart,
    overlay,
    commit: store.commit,
  })

  // ----- Hooks (the primitive; components below are sugar — ADR-0008) ----
  // Each read subscribes with a stable/primitive snapshot so a consumer
  // re-renders only when its own slice changes (ADR-0018).

  function useActive(): ActiveSnapshot<Data> | null {
    return useSyncExternalStore(
      store.subscribe,
      store.getActive,
      store.getServerActive,
    )
  }

  // How the most recent drag ended (ADR-0013), or null before any drag has
  // ended. Set the instant a drag resolves and kept until the next drag
  // starts, so a Return animation (e.g. Snap-back) can read the outcome
  // after `useActive` has already gone null. `outcome === 'accepted'` is the
  // only non-Return ending.
  function useResolution(): Resolution<Data> | null {
    return useSyncExternalStore(
      store.subscribe,
      store.getResolution,
      store.getServerResolution,
    )
  }

  // The Active { id, data } while `zoneId` is the Over Zone, else null. At
  // most one Zone is Over at a time (CONTEXT.md — Over), so this is truthy
  // for exactly one Zone during a drag. The store returns a stable reference,
  // so only the Zones whose membership flips re-render on an Over change.
  function useOver(zoneId: string): DraggedItem<Data> | null {
    const getSnapshot = useCallback(() => store.getOverItem(zoneId), [zoneId])
    return useSyncExternalStore(
      store.subscribe,
      getSnapshot,
      store.getServerOverItem,
    )
  }

  // Whether `id` is the Active Item — a boolean, so an Item re-renders only
  // when its own dragging state flips (ADR-0018).
  function useIsDragging(id: string): boolean {
    const getSnapshot = useCallback(() => store.isActiveId(id), [id])
    return useSyncExternalStore(
      store.subscribe,
      getSnapshot,
      store.getServerIsActiveId,
    )
  }

  // The Overlay primitive (ADR-0018): spread `ref` + `style` onto the Overlay
  // element. The engine measures the node for collision (ADR-0017) and moves it
  // imperatively each frame. `<Active>` / `<SnapBack>` are sugar over this; a
  // headless consumer can render their own Overlay element with it.
  function useOverlay(): OverlayProps {
    const ref = useCallback((node: HTMLElement | null) => {
      overlay.node = node
      // Position a node that mounts after the drag has already started.
      if (node && overlay.place) overlay.place(node)
    }, [])
    return { ref, style: OVERLAY_STYLE }
  }

  // The Item is always what is measured and travels. `dragHandleProps` is
  // what the consumer spreads onto their element: by default it is a full
  // drag handle (trigger + button a11y); with `customDragHandle` the Item
  // is a container (`role: 'group'`) and the trigger moves to a
  // `useDragHandle(id)` element, which may live outside the Item subtree
  // (ADR-0009).
  function useItem(
    id: string,
    data: Data,
    itemOptions: UseItemOptions<Data, Accept, Reject> = {},
  ) {
    // Keep the registry pointed at the latest data/handlers without
    // re-registering the node on every render.
    const dataRef = useRef(data)
    dataRef.current = data
    const onAcceptRef = useRef(itemOptions.onAccept)
    onAcceptRef.current = itemOptions.onAccept
    const onRejectRef = useRef(itemOptions.onReject)
    onRejectRef.current = itemOptions.onReject

    const ref = useCallback(
      (node: HTMLElement | null) => {
        if (node) items.set(id, { node, dataRef, onAcceptRef, onRejectRef })
        else items.delete(id)
      },
      [id],
    )

    const onPointerDown = useCallback(
      (event: ReactPointerEvent) => engine.startDrag(id, event.nativeEvent),
      [id],
    )

    const isDragging = useIsDragging(id)

    // Accessibility defaults baked into the handle (ADR-0011). With a
    // custom handle the Item itself never triggers, so it carries no
    // onPointerDown and is a plain container.
    const dragHandleProps: ItemHandleProps = itemOptions.customDragHandle
      ? { role: 'group' }
      : {
          onPointerDown,
          role: 'button',
          tabIndex: 0,
          'aria-roledescription': 'draggable',
          // Only suppress touch scrolling once a drag is under way; pre-drag
          // the handle keeps default touch-action so a swipe can scroll
          // (ADR-0012).
          style: isDragging ? DRAGGING_HANDLE_STYLE : HANDLE_STYLE,
        }

    return { ref, dragHandleProps, isDragging }
  }

  // A handle is just an element whose onPointerDown calls startDrag(id);
  // no registry, it references the engine + id directly (ADR-0009). Place
  // it anywhere — including outside the Item subtree — since startDrag
  // measures the Item by its registered node, not the handle.
  function useDragHandle(id: string): DragHandleProps {
    const onPointerDown = useCallback(
      (event: ReactPointerEvent) => engine.startDrag(id, event.nativeEvent),
      [id],
    )
    const isDragging = useIsDragging(id)
    return {
      onPointerDown,
      role: 'button',
      tabIndex: 0,
      'aria-roledescription': 'draggable',
      // Only suppress touch scrolling once a drag is under way; pre-drag the
      // handle keeps default touch-action so a swipe can scroll (ADR-0012).
      style: isDragging ? DRAGGING_HANDLE_STYLE : HANDLE_STYLE,
    }
  }

  // Register a Zone's node for measuring/collision together with its single
  // onDrop (ADR-0014: 1 Zone = 1 onDrop). A ref keeps the latest handler so
  // re-renders never re-register the node. onDrop is optional: a Zone with
  // none is still measurable and simply Rejects any Drop.
  function useZone(
    id: string,
    zoneOptions: { onDrop?: ZoneDropHandler<Data, Accept, Reject> } = {},
  ) {
    const onDropRef = useRef(zoneOptions.onDrop)
    onDropRef.current = zoneOptions.onDrop

    const ref = useCallback(
      (node: HTMLElement | null) => {
        if (node) zones.set(id, { node, onDropRef })
        else zones.delete(id)
      },
      [id],
    )

    return { ref }
  }

  // ----- Components (thin sugar over the hooks — ADR-0008) --------------
  // `as` picks the wrapper element/component (default 'div'). For a
  // zero-extra-node layout, use the hook directly instead (ADR-0008).

  function Item({
    id,
    data,
    onAccept,
    onReject,
    customDragHandle,
    as: As = 'div',
    className,
    children,
  }: ItemProps<Data, Accept, Reject>) {
    const { ref, dragHandleProps, isDragging } = useItem(id, data, {
      onAccept,
      onReject,
      customDragHandle,
    })

    return (
      <As
        ref={ref}
        className={className}
        data-dragging={isDragging || undefined}
        {...dragHandleProps}
      >
        {children}
      </As>
    )
  }

  function Zone({
    id,
    onDrop,
    as: As = 'div',
    className,
    children,
  }: ZoneProps<Data, Accept, Reject>) {
    const { ref } = useZone(id, { onDrop })

    return (
      <As ref={ref} className={className}>
        {children}
      </As>
    )
  }

  // The Overlay: portalled to document.body, position: fixed, moved with a
  // translate3d the engine writes imperatively on the `useOverlay` ref each
  // frame (ADR-0010, ADR-0018) — `<Active>` is sugar over that primitive
  // (ADR-0008). On the server `useActive` is inert (null), so this returns
  // before any document access — SSR-safe.
  function Active({ children, className, container }: ActiveProps<Data>) {
    const active = useActive()
    const { ref, style } = useOverlay()
    if (!active) return null

    return createPortal(
      <div ref={ref} className={className} style={style}>
        {children({ id: active.id, data: active.data })}
      </div>,
      container ?? document.body,
    )
  }

  // ----- The returned channel (ADR-0015) --------------------------------
  // createDropAction returns THIS function, not a plain object, so that a
  // module doing `export const DA = createDropAction(...)` is a valid React
  // Fast Refresh boundary (an object export is not): editing that module
  // remounts the Drop Action subtree instead of forcing a full page reload.
  // The function IS the channel and is not meant to be rendered — the API is
  // its members (DA.Zone, DA.Item, DA.Active, the hooks). There is no primary
  // peer to render (ADR-0005), hence a neutral carrier rather than a promoted
  // Zone.
  function DropAction(): null {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        'createDropAction: render a member (e.g. .Zone / .Item / .Active), not the returned value itself.',
      )
    }
    return null
  }

  return Object.assign(DropAction, {
    Item,
    Zone,
    Active,
    useItem,
    useZone,
    useDragHandle,
    useActive,
    useResolution,
    useOver,
    useOverlay,
  })
}
