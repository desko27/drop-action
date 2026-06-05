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
import { rectIntersection } from './collision'
import { createEngine } from './engine'
import { defaultMeasure } from './measure'
import { restrictToWindowEdges } from './modifiers'
import { createStore } from './store'
import type {
  ActiveSnapshot,
  ItemRegistration,
  Resolution,
  ZoneRegistration,
} from './types.private'
import type {
  CreateDropActionOptions,
  DraggedItem,
  DragHandleProps,
  ItemHandleProps,
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

// The factory: returns a namespace of peer components + hooks for one
// self-contained Drop Action (ADR-0005). The store is closure-scoped, so
// only this Drop Action's Items and Zones see each other — isolation is
// structural, so no channel id is needed (ADR-0002).
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
  const store = createStore<Data>()

  // Item ids and Zone ids occupy separate id spaces — two maps — so an
  // Item and a Zone may safely share an id (ADR-0005). These registries
  // are mutable and non-reactive: registering a node triggers no render. A
  // Zone carries its single onDrop with its node (ADR-0014).
  const items = new Map<string, ItemRegistration<Data, Accept, Reject>>()
  const zones = new Map<string, ZoneRegistration<Data, Accept, Reject>>()

  const engine = createEngine<Data, Accept, Reject>({
    items,
    zones,
    measure,
    modifiers,
    collisionDetection,
    activationConstraint: options.activationConstraint,
    setState: store.setState,
  })

  const useDropActionState = () =>
    useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getServerSnapshot,
    )

  // ----- Hooks (the primitive; components below are sugar — ADR-0008) ----

  function useActive(): ActiveSnapshot<Data> | null {
    return useDropActionState().active
  }

  // How the most recent drag ended (ADR-0013), or null before any drag has
  // ended. Set the instant a drag resolves and kept until the next drag
  // starts, so a Return animation (e.g. Snap-back) can read the outcome
  // after `useActive` has already gone null. `outcome === 'accepted'` is the
  // only non-Return ending.
  function useResolution(): Resolution<Data> | null {
    return useDropActionState().resolution
  }

  // The Active { id, data } while `zoneId` is the Over Zone, else null. At
  // most one Zone is Over at a time (CONTEXT.md — Over), so this is truthy
  // for exactly one Zone during a drag.
  function useOver(zoneId: string): DraggedItem<Data> | null {
    const { active, over } = useDropActionState()
    if (!active || over !== zoneId) return null
    return { id: active.id, data: active.data }
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

    const isDragging = useDropActionState().active?.id === id

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
    const isDragging = useDropActionState().active?.id === id
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
  // translate3d that starts over the Item's origin rect and follows the
  // pointer (ADR-0010). On the server `useActive` is inert (null), so this
  // returns before any document access — SSR-safe.
  function Active({ children, className, container }: ActiveProps<Data>) {
    const active = useActive()
    if (!active) return null

    const x = active.originRect.left + active.transform.x
    const y = active.originRect.top + active.transform.y

    return createPortal(
      <div
        className={className}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          transform: `translate3d(${x}px, ${y}px, 0)`,
          pointerEvents: 'none',
        }}
      >
        {children({ id: active.id, data: active.data })}
      </div>,
      container ?? document.body,
    )
  }

  return {
    Item,
    Zone,
    Active,
    useItem,
    useZone,
    useDragHandle,
    useActive,
    useResolution,
    useOver,
  }
}
