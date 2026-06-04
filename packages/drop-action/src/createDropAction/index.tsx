import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { createEngine } from './engine'
import { defaultMeasure } from './measure'
import { createStore } from './store'
import type {
  ActiveSnapshot,
  ItemRegistration,
  ZoneRegistration,
} from './types.private'
import type {
  CreateDropActionOptions,
  DraggedItem,
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
  onDrop: ZoneDropHandler<Data>
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
  const zones = new Map<string, ZoneRegistration<Data>>()

  const engine = createEngine<Data>({
    items,
    zones,
    measure,
    activationConstraint: options.activationConstraint,
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
      // Only suppress touch scrolling once a drag is under way; pre-drag the
      // handle keeps default touch-action so a swipe can scroll (ADR-0012).
      style: isDragging ? DRAGGING_HANDLE_STYLE : HANDLE_STYLE,
    } as const

    return { ref, dragHandleProps, isDragging }
  }

  function useZone(id: string, zoneOptions: { onDrop: ZoneDropHandler<Data> }) {
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

  return { Item, Zone, Active, useItem, useZone, useActive }
}
