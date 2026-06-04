import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { createEngine } from './engine'
import { defaultMeasure } from './measure'
import { createStore } from './store'
import type {
  ActiveSnapshot,
  DropListener,
  ItemRegistration,
  ZoneRegistration,
} from './types.private'
import type {
  CreateDropActionOptions,
  DraggedItem,
  ZoneDropHandler,
} from './types.public'

const HANDLE_STYLE: CSSProperties = {
  touchAction: 'none',
  userSelect: 'none',
}

// Stable empty drop handler for a Zone rendered without an onDrop: its
// Drops are handled remotely via `useDropEvent` (issue #9). Sharing one
// reference keeps the subscription stable across renders.
const noop = () => {}

type UseItemOptions<Data> = {
  onAccept?: (item: DraggedItem<Data>) => void
}

type ItemProps<Data> = {
  id: string
  data: Data
  onAccept?: (item: DraggedItem<Data>) => void
  className?: string
  children?: ReactNode
}

type ZoneProps<Data> = {
  id: string
  // Optional now: a Drop on this Zone may instead be handled remotely
  // through `useDropEvent(id, …)` (issue #9).
  onDrop?: ZoneDropHandler<Data>
  className?: string
  children?: ReactNode
}

type ActiveProps<Data> = {
  children: (item: DraggedItem<Data>) => ReactNode
  className?: string
}

// The factory: returns a namespace of peer components + hooks for one
// self-contained Drop Action (ADR-0005). `id` names the channel; the
// store is closure-scoped, so only this Drop Action's Items and Zones see
// each other.
export function createDropAction<Data = unknown>(
  _id: string,
  options: CreateDropActionOptions = {},
) {
  const measure = options.measure ?? defaultMeasure
  const store = createStore<Data>()

  // Item ids and Zone ids occupy separate id spaces — two maps — so an
  // Item and a Zone may safely share an id (ADR-0005). These registries
  // are mutable and non-reactive: registering a node triggers no render.
  const items = new Map<string, ItemRegistration<Data>>()
  const zones = new Map<string, ZoneRegistration>()
  // Drop handling is a subscription keyed by zoneId, kept separate from the
  // geometry registry above so a Zone can be measured for collision even
  // when its only drop handler lives remotely (issue #9). Many listeners
  // may share a zoneId; a Drop fires them all.
  const dropListeners = new Map<string, Set<DropListener<Data>>>()

  const engine = createEngine<Data>({
    items,
    zones,
    dropListeners,
    measure,
    setState: store.setState,
    reset: store.reset,
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

  function useItem(
    id: string,
    data: Data,
    itemOptions: UseItemOptions<Data> = {},
  ) {
    // Keep the registry pointed at the latest data/handler without
    // re-registering the node on every render.
    const dataRef = useRef(data)
    dataRef.current = data
    const onAcceptRef = useRef(itemOptions.onAccept)
    onAcceptRef.current = itemOptions.onAccept

    const ref = useCallback(
      (node: HTMLElement | null) => {
        if (node) items.set(id, { node, dataRef, onAcceptRef })
        else items.delete(id)
      },
      [id],
    )

    const onPointerDown = useCallback(
      (event: ReactPointerEvent) => engine.startDrag(id, event.nativeEvent),
      [id],
    )

    const isDragging = useDropActionState().active?.id === id

    // Accessibility defaults baked into the handle (ADR-0011).
    const dragHandleProps = {
      onPointerDown,
      role: 'button',
      tabIndex: 0,
      'aria-roledescription': 'draggable',
      style: HANDLE_STYLE,
    } as const

    return { ref, dragHandleProps, isDragging }
  }

  // Subscribe to Drops on a Zone from anywhere in the tree (issue #9). The
  // handler can live far from where the Zone is rendered; it receives the
  // same `{ id, data }` and `respond` the Zone's onDrop would. A ref keeps
  // the latest callback so re-renders never re-subscribe, and the
  // subscription is added on mount / removed on unmount.
  function useDropEvent(zoneId: string, handler: ZoneDropHandler<Data>) {
    const handlerRef = useRef(handler)
    handlerRef.current = handler

    useEffect(() => {
      let set = dropListeners.get(zoneId)
      if (!set) {
        set = new Set()
        dropListeners.set(zoneId, set)
      }
      set.add(handlerRef)
      return () => {
        set.delete(handlerRef)
        if (set.size === 0) dropListeners.delete(zoneId)
      }
    }, [zoneId])
  }

  // Register a Zone's node for measuring/collision, and wire its onDrop
  // through the same listener mechanism as `useDropEvent`, so the Zone's
  // onDrop is sugar over it (issue #9, ADR-0008). onDrop is optional now:
  // a Zone with none is still measurable, its Drops handled remotely.
  function useZone(
    id: string,
    zoneOptions: { onDrop?: ZoneDropHandler<Data> } = {},
  ) {
    const ref = useCallback(
      (node: HTMLElement | null) => {
        if (node) zones.set(id, { node })
        else zones.delete(id)
      },
      [id],
    )

    useDropEvent(id, zoneOptions.onDrop ?? noop)

    return { ref }
  }

  // ----- Components (thin sugar that render a wrapper element) ----------

  function Item({ id, data, onAccept, className, children }: ItemProps<Data>) {
    const { ref, dragHandleProps, isDragging } = useItem(id, data, { onAccept })
    return (
      <div
        ref={ref}
        className={className}
        data-dragging={isDragging || undefined}
        {...dragHandleProps}
      >
        {children}
      </div>
    )
  }

  function Zone({ id, onDrop, className, children }: ZoneProps<Data>) {
    const { ref } = useZone(id, { onDrop })
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    )
  }

  // The Overlay: portalled to document.body, position: fixed, moved with a
  // translate3d that starts over the Item's origin rect and follows the
  // pointer (ADR-0010). On the server `useActive` is inert (null), so this
  // returns before any document access — SSR-safe.
  function Active({ children, className }: ActiveProps<Data>) {
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
      document.body,
    )
  }

  return { Item, Zone, Active, useItem, useZone, useDropEvent, useActive }
}
