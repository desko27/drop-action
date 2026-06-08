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
  DwellConfig,
  HoverRegistration,
  ItemRegistration,
  OverlayRegistry,
  Ref,
  Resolution,
  ZoneRegistration,
} from './types.private'
import type {
  CreateDropActionOptions,
  DraggedItem,
  DragHandleProps,
  Extension,
  GrabAnchor,
  ItemHandleProps,
  OverlayProps,
  UseDwellOptions,
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
  grabAnchor?: GrabAnchor
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

// Merge an Extension tuple's member types into the channel (ADR-0025): each
// Extension returns a members object, and the channel's static type gains their
// intersection. An empty tuple adds `object` (the identity for `&`), so a
// no-extension `createDropAction(options)` keeps exactly the core member type.
type UnionToIntersection<U> = (
  U extends unknown
    ? (k: U) => void
    : never
) extends (k: infer I) => void
  ? I
  : never
type MergedMembers<Exts extends readonly Extension[]> = Exts extends readonly []
  ? object
  : UnionToIntersection<ReturnType<Exts[number]>>

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
  // Grab/grabbing cursor on by default (ADR-0019). The idle handle carries the
  // `grab` affordance unless opted out; the engine handles the global
  // `grabbing` while dragging. Computed once so the style reference is stable.
  const grabCursor = options.grabCursor ?? true
  const idleHandleStyle: CSSProperties = grabCursor
    ? { ...HANDLE_STYLE, cursor: 'grab' }
    : HANDLE_STYLE
  const store = createStore<Data>()

  // Item ids and Zone ids occupy separate id spaces — two maps — so an
  // Item and a Zone may safely share an id (ADR-0005). These registries
  // are mutable and non-reactive: registering a node triggers no render. A
  // Zone carries its single onDrop with its node (ADR-0014).
  const items = new Map<string, ItemRegistration<Data, Accept, Reject>>()
  const zones = new Map<string, ZoneRegistration<Data, Accept, Reject>>()
  // Hover targets live in their own registry (ADR-0024): observe-only, so they
  // never enter Drop resolution and may share ids with Items/Zones.
  const hovers = new Map<string, HoverRegistration<Data>>()

  // The shared handle on the rendered Overlay node (ADR-0017, ADR-0018): the
  // `useOverlay` ref sets `node`; the engine sets `place` and `syncOver` while a
  // drag is live (the latter resolves the deferred initial Over, ADR-0032).
  const overlay: OverlayRegistry = { node: null, place: null, syncOver: null }

  // The drag-time hook slot (ADR-0033): a registry of React hooks an Extension
  // registers at setup, which `useOverlay` runs each render while a drag is live.
  // It lets a behaviour Extension (Auto-scroll) run with zero consumer mounting
  // and inject no public members — `.extend(autoScroll())` is its whole surface.
  // The slot MUST be frozen after setup: `.extend(...)` runs synchronously at
  // construction, before any render, so the call count and order stay stable and
  // the Rules of Hooks hold. A registration after the first render would break
  // them, so dev-warn once a render has read the slot.
  const overlayHooks: Array<() => void> = []
  let overlayHooksFrozen = false
  const registerOverlayHook = (useDragTimeHook: () => void) => {
    if (process.env.NODE_ENV !== 'production' && overlayHooksFrozen)
      console.warn(
        'createDropAction: drag-time hooks must be registered at setup (before the first render). Late registration breaks the Rules of Hooks.',
      )
    overlayHooks.push(useDragTimeHook)
  }

  const engine = createEngine<Data, Accept, Reject>({
    items,
    zones,
    hovers,
    measure,
    modifiers,
    collisionDetection,
    activationConstraint: options.activationConstraint,
    shouldStart,
    grabCursor,
    grabAnchor: options.grabAnchor,
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
  // imperatively each frame. `<Active>` / `<ActiveSnapBack>` are sugar over this; a
  // headless consumer can render their own Overlay element with it.
  function useOverlay(): OverlayProps {
    // Run every Extension-registered drag-time hook (ADR-0033). The slot is
    // frozen after setup, so this calls the same hooks in the same order on every
    // render — the Rules of Hooks hold even though the calls sit in a loop.
    overlayHooksFrozen = true
    for (let i = 0; i < overlayHooks.length; i++) overlayHooks[i]()
    const ref = useCallback((node: HTMLElement | null) => {
      overlay.node = node
      // Position a node that mounts after the drag has already started, then run
      // the first collision pass now that the Overlay is measurable (ADR-0032):
      // the initial Over is deferred at drag-start and resolved here, in the
      // commit phase before paint, so `isOver` never flashes the source rect.
      if (node && overlay.place) overlay.place(node)
      if (node && overlay.syncOver) overlay.syncOver()
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
    // The Item's grab-anchor override (ADR-0021), kept in a ref so a changed
    // value never re-registers the node; read at drag start.
    const grabAnchorRef = useRef(itemOptions.grabAnchor)
    grabAnchorRef.current = itemOptions.grabAnchor

    const ref = useCallback(
      (node: HTMLElement | null) => {
        if (node)
          items.set(id, {
            node,
            dataRef,
            onAcceptRef,
            onRejectRef,
            grabAnchorRef,
          })
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
          style: isDragging ? DRAGGING_HANDLE_STYLE : idleHandleStyle,
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
      style: isDragging ? DRAGGING_HANDLE_STYLE : idleHandleStyle,
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
        // A Zone mounting/unmounting mid-drag re-measures the live drag so it
        // enters or leaves collision at once, not on the next scroll (ADR-0026).
        engine.notifyRegistryChange()
      },
      [id],
    )

    return { ref }
  }

  // Register a Hover target (ADR-0024): an observe-only element the engine
  // pointer-tests each frame, never a drop target. The boolean tracks whether
  // the drag's cursor is currently inside it — read off the store like
  // `isActiveId`, so a Hover target re-renders only when its membership flips
  // (ADR-0018). `useDwell` is built on this; the optional `dwellRef` carries
  // its settle config and is `undefined` for a pure `useHover`.
  function useHoverState(
    id: string,
    dwellRef: Ref<DwellConfig<Data> | undefined>,
  ) {
    const ref = useCallback(
      (node: HTMLElement | null) => {
        if (node) hovers.set(id, { node, dwellRef })
        else hovers.delete(id)
        // A Hover/Dwell target mounting mid-drag (a spring-opened level) enters
        // the per-frame pass at once instead of on the next scroll (ADR-0026).
        engine.notifyRegistryChange()
      },
      // `dwellRef` is a stable useRef from the caller; listed to satisfy the
      // exhaustive-deps lint without ever re-registering the node.
      [id, dwellRef],
    )

    const getSnapshot = useCallback(() => store.isHoverId(id), [id])
    const isHovering = useSyncExternalStore(
      store.subscribe,
      getSnapshot,
      store.getServerIsHoverId,
    )

    return { ref, isHovering }
  }

  // Observe-only over-detection for an arbitrary element (ADR-0024): `isHovering`
  // is true while the drag's cursor is inside it, even though `setPointerCapture`
  // has killed DOM hover. A Drop never lands here. The generic seam dwell and
  // userland behaviours (auto-scroll, tab-switch) build on.
  function useHover(id: string) {
    const dwellRef = useRef<DwellConfig<Data> | undefined>(undefined)
    return useHoverState(id, dwellRef)
  }

  // Spring-load timing over a Hover target (ADR-0024): `onDwell` fires once the
  // cursor settles within `tolerance` px for `dwellMs` ms, re-arming only after
  // the drag leaves or moves off the settle point. The engine owns the timer
  // (it needs the per-frame pointer the store withholds, ADR-0018); `isDwelling`
  // is the same immediate cursor-inside signal as `useHover`'s `isHovering`.
  function useDwell(id: string, options: UseDwellOptions<Data>) {
    const dwellRef = useRef<DwellConfig<Data> | undefined>(undefined)
    // Defaults resolved here so the engine reads concrete values; refreshed each
    // render so a changed `onDwell` is honoured without re-registering the node.
    dwellRef.current = {
      onDwell: options.onDwell,
      dwellMs: options.dwellMs ?? 500,
      tolerance: options.tolerance ?? 8,
    }
    const { ref, isHovering } = useHoverState(id, dwellRef)
    return { ref, isDwelling: isHovering }
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
    grabAnchor,
    as: As = 'div',
    className,
    children,
  }: ItemProps<Data, Accept, Reject>) {
    const { ref, dragHandleProps, isDragging } = useItem(id, data, {
      onAccept,
      onReject,
      customDragHandle,
      grabAnchor,
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

  const baseMembers = {
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
    useHover,
    useDwell,
  }
  type Channel = typeof DropAction & typeof baseMembers

  // Apply Extensions (ADR-0025): `.extend(...)` takes one or more Extensions,
  // calls each with the channel, and merges the returned members under it, so
  // they read as `DA.ActiveSnapBack`, `DA.useActiveSnapBack`, … An Extension reads only
  // public members, so the core carries just this tiny merge — each Extension's
  // code arrives via its own subpath import, keeping it tree-shakeable
  // (ADR-0004). It is a method, not a second `createDropAction` argument,
  // because TypeScript stops inferring trailing type parameters once `Data` is
  // given explicitly — a separate call site lets the Extension tuple infer so
  // the merged members stay typed. A returned name colliding with an existing
  // member is a mistake (Extensions are additive, not overrides), so warn in dev.
  function extend<const Exts extends readonly Extension[]>(
    ...exts: Exts
  ): Channel & MergedMembers<Exts> {
    for (const ext of exts) {
      const members = ext(channel)
      if (process.env.NODE_ENV !== 'production') {
        for (const key of Object.keys(members))
          if (key in channel)
            console.warn(
              `createDropAction: extension overrides existing member "${key}".`,
            )
      }
      Object.assign(channel, members)
    }
    // The runtime merge added the Extension members; the generic
    // `MergedMembers<Exts>` cannot be related to the concrete channel type, so
    // assert through `unknown`.
    return channel as unknown as Channel & MergedMembers<Exts>
  }

  // `registerOverlayHook` is the drag-time hook seam (ADR-0033): present on the
  // channel an Extension receives, but deliberately NOT surfaced on the post-
  // `.extend()` type — registration belongs at setup, never after, so the
  // returned channel hides it. Extensions reach it through their own cast (the
  // channel is typed `unknown`, ADR-0025), the same way snap-back reads its hooks.
  const channel: Channel & {
    extend: typeof extend
    registerOverlayHook: typeof registerOverlayHook
  } = Object.assign(DropAction, { ...baseMembers, extend, registerOverlayHook })

  return channel
}
